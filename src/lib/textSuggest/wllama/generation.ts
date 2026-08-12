import type { Wllama } from "@wllama/wllama/esm/index.js";
import type {
  ProofreadRequest,
  ProofreadResult,
  SuggestRequest,
  SuggestResult,
} from "../types";
import {
  buildProofreadingMessages,
  buildSuggestionMessages,
} from "./prompts";
import {
  normalizeContinuation,
  normalizeProofreading,
} from "./responseNormalization";

export interface SuggestOptions {
  maxTokens: number;
  temperature: number;
  abortSignal?: AbortSignal;
}

export async function generateSuggestion(
  llm: Wllama,
  req: SuggestRequest,
  options: SuggestOptions,
): Promise<SuggestResult> {
  const maxTokens = Math.max(4, Math.min(256, options.maxTokens));
  const startedAt = performance.now();
  const result = await llm.createChatCompletion({
    messages: buildSuggestionMessages(req.prefix, maxTokens),
    stream: false,
    max_tokens: maxTokens,
    temperature: Math.max(options.temperature, 0.35),
    top_k: 40,
    top_p: 0.92,
    min_p: 0.05,
    penalty_last_n: 64,
    penalty_repeat: 1.12,
    abortSignal: options.abortSignal,
  });
  const rawText = result.choices[0]?.message.content ?? "";
  console.debug("[textSuggest] generate", {
    maxTokens,
    rawText,
    timeMs: performance.now() - startedAt,
  });
  return {
    text: normalizeContinuation(rawText, req.prefix),
    msElapsed: performance.now() - startedAt,
  };
}

const PROOFREAD_CHUNK_CHARS = 2400;

function findChunkEnd(document: string, start: number): number {
  const maximum = Math.min(document.length, start + PROOFREAD_CHUNK_CHARS);
  if (maximum === document.length) return maximum;

  const minimum = start + Math.floor(PROOFREAD_CHUNK_CHARS * 0.55);
  const candidate = document.slice(minimum, maximum);
  for (const boundary of ["\n\n", "\n", " "]) {
    const offset = candidate.lastIndexOf(boundary);
    if (offset !== -1) return minimum + offset + boundary.length;
  }
  return maximum;
}

export function splitProofreadingDocument(document: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < document.length) {
    const end = findChunkEnd(document, start);
    chunks.push(document.slice(start, end));
    start = end;
  }
  return chunks;
}

export async function generateProofreading(
  llm: Wllama,
  req: ProofreadRequest,
  abortSignal?: AbortSignal,
): Promise<ProofreadResult> {
  const startedAt = performance.now();
  const chunks = splitProofreadingDocument(req.document);
  const revisedChunks: string[] = [];

  for (const chunk of chunks) {
    if (abortSignal?.aborted) {
      throw new DOMException("Proofreading cancelled", "AbortError");
    }
    const maxTokens = Math.max(128, Math.min(768, Math.ceil(chunk.length / 3)));
    const result = await llm.createChatCompletion({
      messages: buildProofreadingMessages(chunk, req.instruction),
      stream: false,
      max_tokens: maxTokens,
      temperature: 0.1,
      top_k: 20,
      top_p: 0.9,
      penalty_repeat: 1.05,
      abortSignal,
    });
    const rawText = result.choices[0]?.message.content ?? "";
    revisedChunks.push(normalizeProofreading(rawText, chunk));
  }

  const text = revisedChunks.join("");
  console.debug("[textSuggest] proofreading", {
    chunks: chunks.length,
    inputCharacters: req.document.length,
    outputCharacters: text.length,
    timeMs: performance.now() - startedAt,
  });
  return { text, msElapsed: performance.now() - startedAt };
}
