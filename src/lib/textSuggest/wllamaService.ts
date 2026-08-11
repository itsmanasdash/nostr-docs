import { CacheManager, Wllama } from "@wllama/wllama/esm/index.js";
import type {
  CorrectWordRequest,
  CorrectWordResult,
  SuggestRequest,
  SuggestResult,
  TextSuggestModelEntry,
} from "./types";
import { shouldUseWebGPUForLocalAI } from "./environment";

export type LoadProgress = { bytes: number; total: number };

const WASM_PATH = "/wllama/wllama.wasm";
const CONTEXT_SIZE = 2048;
const GPU_LAYERS = 999;

class InMemoryStorageBackend {
  private files = new Map<string, Blob>();

  isSupported(): boolean {
    return true;
  }

  read(key: string): Promise<Blob | null> {
    return Promise.resolve(this.files.get(key) ?? null);
  }

  async write(key: string, stream: ReadableStream): Promise<void> {
    this.files.set(key, await new Response(stream).blob());
  }

  getSize(key: string): Promise<number> {
    return Promise.resolve(this.files.get(key)?.size ?? -1);
  }

  list(): Promise<Array<{ key: string; size: number }>> {
    return Promise.resolve(
      Array.from(this.files, ([key, file]) => ({ key, size: file.size })),
    );
  }

  delete(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }
}

function createCacheManager(): CacheManager {
  try {
    return new CacheManager();
  } catch {
    // Capacitor WebViews may not expose OPFS. Local GGUF files do not need a
    // persistent cache, but Wllama still requires a supported cache backend.
    return new CacheManager([new InMemoryStorageBackend()]);
  }
}

class TextSuggestService {
  private llm: Wllama | null = null;
  private loadedModelId: string | null = null;
  private loadingPromise: Promise<void> | null = null;

  /**
   * Serial generation lock. wllama/WebGPU cannot safely run two completions
   * at once — overlapping requests show up as RuntimeError: unreachable in
   * ggml_backend_webgpu_*.
   */
  private generationTail: Promise<void> = Promise.resolve();
  private suggestSeq = 0;
  private correctionSeq = 0;

  isModelLoaded(modelId: string): boolean {
    return (
      this.loadedModelId === modelId && this.llm?.isModelLoaded() === true
    );
  }

  async ensureLoadedFromFile(
    file: File,
    model: Pick<TextSuggestModelEntry, "id" | "label">,
    onProgress?: (p: LoadProgress) => void,
  ): Promise<void> {
    if (this.isModelLoaded(model.id)) return;
    if (this.loadingPromise) await this.loadingPromise;
    if (this.isModelLoaded(model.id)) return;

    this.loadingPromise = this.loadFile(file, model, onProgress);
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async loadFile(
    file: File,
    model: Pick<TextSuggestModelEntry, "id" | "label">,
    onProgress?: (p: LoadProgress) => void,
  ): Promise<void> {
    await this.unload();

    const llm = new Wllama(
      { default: WASM_PATH },
      { cacheManager: createCacheManager() },
    );
    this.llm = llm;

    try {
      const useWebGPU = shouldUseWebGPUForLocalAI();
      onProgress?.({ bytes: 10, total: 100 });
      onProgress?.({ bytes: 30, total: 100 });
      await llm.loadModel([file], {
        n_ctx: CONTEXT_SIZE,
        // Mobile WebGPU can produce corrupt logits for some architectures
        // (notably Qwen), resulting in one garbage token repeated forever.
        n_gpu_layers: useWebGPU ? GPU_LAYERS : 0,
        jinja: true,
      });
      console.debug("[textSuggest] model loaded", {
        model: model.label,
        backend: useWebGPU ? "WebGPU" : "WASM/CPU",
      });
      this.loadedModelId = model.id;
      onProgress?.({ bytes: 100, total: 100 });
    } catch (error: unknown) {
      try {
        await llm.exit();
      } catch {
        // Preserve the original model-loading error.
      }
      if (this.llm === llm) this.llm = null;
      this.loadedModelId = null;
      throw error instanceof Error
        ? error
        : new Error("Failed to load model");
    }
  }

  private buildSystemPrompt(maxTokens: number): string {
    const approxWords = Math.max(4, Math.round(maxTokens * 0.7));
    return [
      "You are autocomplete for a document editor.",
      "Continue the document from the exact end of the given text.",
      `Write about ${approxWords} words of natural continuation (target length matters).`,
      "You may write more than one clause if that fits the target length.",
      "If the document ends mid-sentence, continue mid-sentence — do NOT add a period, question mark, or exclamation mark at the end.",
      "Only use sentence-ending punctuation when finishing a sentence that clearly completes.",
      "Do not answer questions, explain, summarize, or chat.",
      "Do not put the continuation in quotes.",
      "Do not repeat text that is already in the document.",
      "Output ONLY the continuation text.",
    ].join(" ");
  }

  private buildUserPrompt(prefix: string, maxTokens: number): string {
    const tail = prefix.slice(-800);
    const approxWords = Math.max(4, Math.round(maxTokens * 0.7));
    return (
      `Document text up to the cursor:\n` +
      `---\n${tail}\n---\n` +
      `Continue from the end with ~${approxWords} words. Continuation only:`
    );
  }

  private normalizeContinuation(text: string, prefix: string): string {
    let out = text
      .replace(/\r/g, "")
      .replace(/^[\s]*["'`]+/, "")
      .replace(/["'`]+[\s]*$/, "")
      .replace(
        /^\s*(?:Sure[.,]?|Okay[.,]?|Alright[.,]?|Here(?:'s| is)?(?: the)?(?: continuation| next words| text)?(?::|-)?\s*)/i,
        "",
      )
      .replace(
        /^\s*(?:Certainly[.,]?|Of course[.,]?|I'd be happy to[^.\n]*[.!]?\s*)/i,
        "",
      )
      .replace(/^\s*(?:Continuation|Next words)\s*(?::|-)\s*/i, "");

    const echo = prefix.slice(-40).trim();
    if (echo && out.toLowerCase().startsWith(echo.toLowerCase())) {
      out = out.slice(echo.length);
    }

    // Ghost text can span one paragraph; stop at a blank line.
    const blank = out.search(/\n\s*\n/);
    if (blank !== -1) out = out.slice(0, blank);
    out = out.replace(/\n+/g, " ").replace(/\s+$/, "");

    // If the user is mid-sentence, strip a trailing sentence ender the model
    // often adds out of habit.
    const trimmedPrefix = prefix.replace(/\s+$/, "");
    const midSentence =
      trimmedPrefix.length > 0 && !/[.!?…]"?$/.test(trimmedPrefix);
    if (midSentence) {
      out = out.replace(/[.!?]+["']?\s*$/, "");
    }

    if (out && prefix.length > 0 && !/\s$/.test(prefix) && !/^\s/.test(out)) {
      out = ` ${out}`;
    }

    return out;
  }

  private normalizeCorrection(text: string, original: string): string | null {
    let replacement = text
      .replace(/\r/g, "")
      .split("\n", 1)[0]
      .replace(/^\s*(?:correction|corrected word|replacement)\s*:\s*/i, "")
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/[.,;:!?]+$/, "")
      .trim();

    if (/^(?:same|unchanged|correct|none)$/i.test(replacement)) return null;
    if (replacement.toLocaleLowerCase() === original.toLocaleLowerCase()) {
      return null;
    }

    // A correction must remain one word. This rejects explanations, model
    // chatter, and malformed output from very small local models.
    if (
      !/^[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*$/u.test(replacement) ||
      replacement.length > Math.max(32, original.length * 3)
    ) {
      return null;
    }

    if (original === original.toLocaleUpperCase()) {
      replacement = replacement.toLocaleUpperCase();
    } else if (/^\p{Lu}/u.test(original)) {
      replacement =
        replacement.charAt(0).toLocaleUpperCase() + replacement.slice(1);
    }

    return replacement;
  }

  private async enqueueGeneration<T>(run: () => Promise<T>): Promise<T> {
    const previous = this.generationTail;
    let release!: () => void;
    this.generationTail = new Promise<void>((resolve) => {
      release = resolve;
    });

    try {
      await previous;
      return await run();
    } finally {
      release();
    }
  }

  /**
   * Queue a suggestion so only one generation runs at a time.
   * Phi-3 / other instruct GGUFs need the chat template
   * (`createChatCompletion`), not raw `createCompletion` prompts.
   */
  async suggest(
    req: SuggestRequest,
    opts: {
      maxTokens: number;
      temperature: number;
      abortSignal?: AbortSignal;
    },
  ): Promise<SuggestResult> {
    const llm = this.llm;
    if (!llm?.isModelLoaded()) {
      throw new Error("Model not loaded");
    }

    const mySeq = ++this.suggestSeq;
    const maxTokens = Math.max(4, Math.min(256, opts.maxTokens));

    const run = async (): Promise<SuggestResult> => {
      if (mySeq !== this.suggestSeq || opts.abortSignal?.aborted) {
        throw new DOMException("Suggestion superseded", "AbortError");
      }

      const t0 = performance.now();
      const result = await llm.createChatCompletion({
        messages: [
          {
            role: "system",
            content: this.buildSystemPrompt(maxTokens),
          },
          {
            role: "user",
            content: this.buildUserPrompt(req.prefix, maxTokens),
          },
        ],
        stream: false,
        max_tokens: maxTokens,
        temperature: Math.max(opts.temperature, 0.35),
        top_k: 40,
        top_p: 0.92,
        min_p: 0.05,
        penalty_last_n: 64,
        penalty_repeat: 1.12,
        abortSignal: opts.abortSignal,
      });

      if (mySeq !== this.suggestSeq || opts.abortSignal?.aborted) {
        throw new DOMException("Suggestion superseded", "AbortError");
      }

      const rawText = result.choices[0]?.message.content ?? "";

      console.debug("[textSuggest] generate", {
        maxTokens,
        rawText,
        timeMs: performance.now() - t0,
      });

      const text = this.normalizeContinuation(rawText, req.prefix);
      return { text, msElapsed: performance.now() - t0 };
    };

    return this.enqueueGeneration(run);
  }

  /**
   * Check one completed word for a likely spelling/typing error. Corrections
   * share the same serial queue as autocomplete, so both features can safely
   * use one Wllama instance without overlapping WebGPU/WASM work.
   */
  async correctWord(
    req: CorrectWordRequest,
    opts: { abortSignal?: AbortSignal } = {},
  ): Promise<CorrectWordResult> {
    const llm = this.llm;
    if (!llm?.isModelLoaded()) {
      throw new Error("Model not loaded");
    }

    const mySeq = ++this.correctionSeq;
    const run = async (): Promise<CorrectWordResult> => {
      if (mySeq !== this.correctionSeq || opts.abortSignal?.aborted) {
        throw new DOMException("Correction superseded", "AbortError");
      }

      const t0 = performance.now();
      const context = req.context.slice(-500);
      const result = await llm.createChatCompletion({
        messages: [
          {
            role: "system",
            content: [
              "You are a conservative spelling and typing-error checker.",
              "Given one candidate word and its nearby document context, output the corrected single word only.",
              "Preserve the language and intended capitalization.",
              "Do not rewrite grammar or expand abbreviations.",
              "If the word is already correct, is a name, slang, technical term, abbreviation, or you are unsure, output SAME.",
              "Never output punctuation, quotes, JSON, or an explanation.",
            ].join(" "),
          },
          {
            role: "user",
            content: `Context:\n---\n${context}\n---\nCandidate word: ${req.word}`,
          },
        ],
        stream: false,
        max_tokens: 12,
        temperature: 0,
        top_k: 1,
        top_p: 1,
        abortSignal: opts.abortSignal,
      });

      if (mySeq !== this.correctionSeq || opts.abortSignal?.aborted) {
        throw new DOMException("Correction superseded", "AbortError");
      }

      const rawText = result.choices[0]?.message.content ?? "";
      const replacement = this.normalizeCorrection(rawText, req.word);
      console.debug("[textSuggest] correction", {
        word: req.word,
        rawText,
        replacement,
        timeMs: performance.now() - t0,
      });
      return { replacement, msElapsed: performance.now() - t0 };
    };

    return this.enqueueGeneration(run);
  }

  async unload(): Promise<void> {
    this.suggestSeq++;
    this.correctionSeq++;
    await this.generationTail;
    const llm = this.llm;
    this.llm = null;
    this.loadedModelId = null;
    if (llm) {
      try {
        await llm.exit();
      } catch {
        // Ignore shutdown errors while releasing the current model.
      }
    }
  }
}

export const textSuggestService = new TextSuggestService();
