import { useCallback, useEffect, useRef, useState } from "react";
import { loadPrefs, savePrefs } from "../lib/textSuggest/prefs";
import { makeModelId, resolveActiveModel } from "../lib/textSuggest/modelCatalog";
import { textSuggestService } from "../lib/textSuggest/wllamaService";
import type {
  TextSuggestModelEntry,
  TextSuggestPrefs,
  TextSuggestState,
} from "../lib/textSuggest/types";

/** Suggestion text plus the editor cursor pos it was requested for. */
export interface TextSuggestion {
  text: string;
  pos: number;
}

export interface TextCorrection {
  id: string;
  original: string;
  replacement: string;
  from: number;
  to: number;
}

export interface TextCorrectionRequest {
  word: string;
  context: string;
  from: number;
  to: number;
}

interface UseTextSuggestReturn {
  state: TextSuggestState;
  prefs: TextSuggestPrefs | null;
  suggestion: TextSuggestion | null;
  correction: TextCorrection | null;
  /** Call on every doc change with the text before the cursor. Debounced internally. */
  requestSuggestion: (prefix: string, cursorPos: number) => void;
  /** Clear the current suggestion immediately (e.g. cursor moved, user kept typing past it). */
  clearSuggestion: () => void;
  /** Check a completed word and return a conservative tap-to-apply correction. */
  requestCorrection: (request: TextCorrectionRequest) => void;
  /** Cancel a correction request that has not been applied to the editor yet. */
  clearCorrection: () => void;
  /**
   * Call on selection-only cursor moves. Aborts pending/shown suggestions
   * unless the cursor is still at the position they were requested for.
   */
  notifyCursorPos: (cursorPos: number) => void;
  reload: () => Promise<void>;
  updatePrefs: (next: TextSuggestPrefs) => Promise<void>;
  loadModelFromFile: (file: File) => Promise<void>;
  removeActiveModel: () => Promise<void>;
}

function hasEnabledFeature(value: TextSuggestPrefs): boolean {
  return value.enabled || value.autoCorrectEnabled;
}

export function useTextSuggest(): UseTextSuggestReturn {
  const [state, setState] = useState<TextSuggestState>({ kind: "disabled" });
  const [prefs, setPrefs] = useState<TextSuggestPrefs | null>(null);
  const [suggestion, setSuggestion] = useState<TextSuggestion | null>(null);
  const [correction, setCorrection] = useState<TextCorrection | null>(null);

  const prefsRef = useRef<TextSuggestPrefs | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Monotonically increasing token — guards against a slow request from an
  // earlier keystroke resolving after a newer one already started.
  const requestIdRef = useRef(0);
  /** Cursor pos the in-flight / debounced request was made for. */
  const pendingPosRef = useRef<number | null>(null);
  const suggestionRef = useRef<TextSuggestion | null>(null);
  suggestionRef.current = suggestion;
  const correctionDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const correctionAbortRef = useRef<AbortController | null>(null);
  const correctionRequestIdRef = useRef(0);
  const lastCorrectionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadPrefs().then((p) => {
      if (!alive) return;
      prefsRef.current = p;
      setPrefs(p);
      setState(
        !hasEnabledFeature(p)
          ? { kind: "disabled" }
          : resolveActiveModel(p)
            ? { kind: "ready" }
            : { kind: "needs-setup" },
      );
    });
    return () => {
      alive = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const next = await loadPrefs();
    prefsRef.current = next;
    setPrefs(next);
    setState(
      !hasEnabledFeature(next)
        ? { kind: "disabled" }
        : resolveActiveModel(next)
          ? { kind: "ready" }
          : { kind: "needs-setup" },
    );
  }, []);

  const updatePrefs = useCallback(async (next: TextSuggestPrefs) => {
    prefsRef.current = next;
    setPrefs(next);
    await savePrefs(next);
    if (!hasEnabledFeature(next)) {
      setState({ kind: "disabled" });
    } else {
      setState(resolveActiveModel(next) ? { kind: "ready" } : { kind: "needs-setup" });
    }
  }, []);

  const loadModelFromFile = useCallback(async (file: File) => {
    const currentPrefs = prefsRef.current ?? (await loadPrefs());
    const objectUrl = URL.createObjectURL(file);
    const model: TextSuggestModelEntry = {
      id: makeModelId(objectUrl),
      label: file.name,
      url: objectUrl,
    };

    const nextPrefs: TextSuggestPrefs = {
      ...currentPrefs,
      enabled: currentPrefs.enabled || !currentPrefs.autoCorrectEnabled,
      models: [...currentPrefs.models, model],
      activeModelId: model.id,
    };

    setState({ kind: "loading" });
    try {
      await textSuggestService.ensureLoadedFromFile(file, model, (p) => {
        setState({ kind: "downloading", bytes: p.bytes, total: p.total });
      });
      prefsRef.current = nextPrefs;
      setPrefs(nextPrefs);
      await savePrefs(nextPrefs);
      setState({ kind: "ready" });
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }, []);

  const removeActiveModel = useCallback(async () => {
    const currentPrefs = prefsRef.current ?? (await loadPrefs());
    if (!currentPrefs.activeModelId) {
      setState({ kind: "needs-setup" });
      return;
    }

    const nextModels = currentPrefs.models.filter(
      (model) => model.id !== currentPrefs.activeModelId,
    );
    const nextPrefs: TextSuggestPrefs = {
      ...currentPrefs,
      enabled: currentPrefs.enabled && nextModels.length > 0,
      autoCorrectEnabled:
        currentPrefs.autoCorrectEnabled && nextModels.length > 0,
      models: nextModels,
      activeModelId: nextModels[0]?.id ?? null,
    };

    prefsRef.current = nextPrefs;
    setPrefs(nextPrefs);
    await savePrefs(nextPrefs);
    await textSuggestService.unload();
    setState(
      hasEnabledFeature(nextPrefs)
        ? { kind: "needs-setup" }
        : { kind: "disabled" },
    );
  }, []);

  const clearSuggestion = useCallback(() => {
    setSuggestion(null);
    pendingPosRef.current = null;
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    // Soft-cancel only: mark stale so queued work is skipped. Do not try to
    // tear down an in-flight WebGPU graph — that races and crashes wllama.
    abortRef.current?.abort();
    abortRef.current = null;
    requestIdRef.current++;
  }, []);

  const notifyCursorPos = useCallback(
    (cursorPos: number) => {
      // Still at the request/suggestion site — keep waiting / showing.
      if (pendingPosRef.current === cursorPos) return;
      if (suggestionRef.current?.pos === cursorPos) return;
      // Cursor moved away — drop pending and shown suggestions.
      if (pendingPosRef.current !== null || suggestionRef.current !== null) {
        clearSuggestion();
      }
    },
    [clearSuggestion],
  );

  const clearCorrection = useCallback(() => {
    setCorrection(null);
    if (correctionDebounceTimer.current) {
      clearTimeout(correctionDebounceTimer.current);
      correctionDebounceTimer.current = null;
    }
    correctionAbortRef.current?.abort();
    correctionAbortRef.current = null;
    correctionRequestIdRef.current++;
  }, []);

  const requestCorrection = useCallback((request: TextCorrectionRequest) => {
    const currentPrefs = prefsRef.current;
    if (!currentPrefs?.autoCorrectEnabled) return;
    const model = resolveActiveModel(currentPrefs);
    if (!model || request.word.length < 3) return;

    const requestKey = [
      request.from,
      request.to,
      request.word,
      request.context.slice(-80),
    ].join(":");
    if (lastCorrectionKeyRef.current === requestKey) return;
    lastCorrectionKeyRef.current = requestKey;

    if (correctionDebounceTimer.current) {
      clearTimeout(correctionDebounceTimer.current);
    }
    correctionAbortRef.current?.abort();
    correctionAbortRef.current = null;
    setCorrection(null);

    const myRequestId = ++correctionRequestIdRef.current;
    // Autocorrection starts first when both tools are enabled. Autocomplete
    // uses the user-configured (normally longer) debounce and then waits in
    // the service's shared serial generation queue.
    const debounceMs = Math.min(400, currentPrefs.debounceMs);
    correctionDebounceTimer.current = setTimeout(async () => {
      if (myRequestId !== correctionRequestIdRef.current) return;
      const latestPrefs = prefsRef.current;
      if (!latestPrefs?.autoCorrectEnabled) return;
      const latestModel = resolveActiveModel(latestPrefs);
      if (!latestModel) return;

      const controller = new AbortController();
      correctionAbortRef.current = controller;
      try {
        if (!textSuggestService.isModelLoaded(latestModel.id)) {
          setState({
            kind: "error",
            message:
              "Model not loaded. Open Local AI settings and load a GGUF file.",
          });
          return;
        }

        const result = await textSuggestService.correctWord(
          { word: request.word, context: request.context },
          { abortSignal: controller.signal },
        );
        if (
          myRequestId !== correctionRequestIdRef.current ||
          controller.signal.aborted ||
          !result.replacement
        ) {
          return;
        }

        setCorrection({
          id: `${myRequestId}:${request.from}:${request.word}`,
          original: request.word,
          replacement: result.replacement,
          from: request.from,
          to: request.to,
        });
      } catch (err) {
        if (myRequestId !== correctionRequestIdRef.current) return;
        const isAbort =
          err instanceof Error &&
          (err.name === "AbortError" || /abort|superseded/i.test(err.message));
        if (!isAbort) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[textSuggest] correction error", {
            requestId: myRequestId,
            word: request.word,
            error: err,
          });
          setState({ kind: "error", message });
        }
      }
    }, debounceMs);
  }, []);

  const requestSuggestion = useCallback((prefix: string, cursorPos: number) => {
    const currentPrefs = prefsRef.current;
    if (!currentPrefs?.enabled) return;
    const model = resolveActiveModel(currentPrefs);
    if (!model) return;

    // A blank line / start of doc isn't worth bothering the model for.
    if (!prefix.trim()) {
      clearSuggestion();
      return;
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    // Invalidate any pending/in-flight suggestion for older prefixes.
    abortRef.current?.abort();
    abortRef.current = null;
    setSuggestion(null);

    const myRequestId = ++requestIdRef.current;
    const requestPos = cursorPos;
    pendingPosRef.current = requestPos;

    console.debug("[textSuggest] request", {
      requestId: myRequestId,
      cursorPos: requestPos,
      prefixLength: prefix.length,
      enabled: currentPrefs.enabled,
      activeModelId: currentPrefs.activeModelId,
      modelLabel: model.label,
    });

    // Debounce: only the pause after typing hits the model.
    debounceTimer.current = setTimeout(async () => {
      if (myRequestId !== requestIdRef.current) return;
      // Cursor moved during the debounce window.
      if (pendingPosRef.current !== requestPos) return;

      // Read prefs at fire-time so settings changes (maxTokens, etc.) apply
      // even if the debounce was scheduled before the slider commit.
      const latestPrefs = prefsRef.current;
      if (!latestPrefs?.enabled) return;
      const latestModel = resolveActiveModel(latestPrefs);
      if (!latestModel) return;

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        if (!textSuggestService.isModelLoaded(latestModel.id)) {
          console.debug("[textSuggest] model not loaded", {
            requestId: myRequestId,
            modelId: latestModel.id,
            modelLabel: latestModel.label,
          });
          setState({
            kind: "error",
            message: "Model not loaded. Open Text suggestion settings and load a GGUF file.",
          });
          return;
        }

        if (
          myRequestId !== requestIdRef.current ||
          controller.signal.aborted ||
          pendingPosRef.current !== requestPos
        ) {
          return;
        }

        setState((s) =>
          s.kind === "error" || s.kind === "ready" || s.kind === "thinking"
            ? { kind: "thinking" }
            : s,
        );

        console.debug("[textSuggest] calling suggest", {
          requestId: myRequestId,
          cursorPos: requestPos,
          prefix: prefix.slice(-200),
          maxTokens: latestPrefs.maxTokens,
          temperature: latestPrefs.temperature,
        });

        const result = await textSuggestService.suggest(
          { prefix },
          {
            maxTokens: latestPrefs.maxTokens,
            temperature: latestPrefs.temperature,
            abortSignal: controller.signal,
          },
        );

        // Cursor moved (or a newer request started) while we were generating.
        if (
          myRequestId !== requestIdRef.current ||
          pendingPosRef.current !== requestPos
        ) {
          return;
        }

        const cleaned = result.text.replace(/\s+$/, "");
        console.debug("[textSuggest] response", {
          requestId: myRequestId,
          cursorPos: requestPos,
          rawText: result.text,
          cleanedText: cleaned,
          msElapsed: result.msElapsed,
        });
        if (cleaned.trim()) {
          setSuggestion({ text: cleaned, pos: requestPos });
        }
        setState((s) => (s.kind === "thinking" ? { kind: "ready" } : s));
      } catch (err) {
        if (myRequestId !== requestIdRef.current) return;
        const isAbort =
          err instanceof Error &&
          (err.name === "AbortError" || /abort|superseded/i.test(err.message));
        if (!isAbort) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[textSuggest] error", {
            requestId: myRequestId,
            error: err,
            message: msg,
          });
          setState({ kind: "error", message: msg });
        } else {
          setState((s) => (s.kind === "thinking" ? { kind: "ready" } : s));
        }
      }
    }, currentPrefs.debounceMs);
  }, [clearSuggestion]);

  // Stop any pending work on unmount (route change, doc switch, etc).
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      abortRef.current?.abort();
      if (correctionDebounceTimer.current) {
        clearTimeout(correctionDebounceTimer.current);
      }
      correctionAbortRef.current?.abort();
    };
  }, []);

  return {
    state,
    prefs,
    suggestion,
    correction,
    requestSuggestion,
    clearSuggestion,
    requestCorrection,
    clearCorrection,
    notifyCursorPos,
    reload,
    updatePrefs,
    loadModelFromFile,
    removeActiveModel,
  };
}

export type TextSuggestHook = ReturnType<typeof useTextSuggest>;
