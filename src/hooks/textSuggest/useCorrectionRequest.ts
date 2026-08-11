import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { resolveActiveModel } from "../../lib/textSuggest/modelCatalog";
import { textSuggestService } from "../../lib/textSuggest/wllamaService";
import type {
  TextSuggestPrefs,
  TextSuggestState,
} from "../../lib/textSuggest/types";
import type { TextCorrection, TextCorrectionRequest } from "./types";
import { isAbortError } from "./requestUtils";

interface Options {
  prefsRef: { current: TextSuggestPrefs | null };
  setState: Dispatch<SetStateAction<TextSuggestState>>;
}

export function useCorrectionRequest({ prefsRef, setState }: Options) {
  const [correction, setCorrection] = useState<TextCorrection | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const lastRequestKeyRef = useRef<string | null>(null);

  const clearCorrection = useCallback(() => {
    setCorrection(null);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    requestIdRef.current++;
  }, []);

  const requestCorrection = useCallback(
    (request: TextCorrectionRequest) => {
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
      if (lastRequestKeyRef.current === requestKey) return;
      lastRequestKeyRef.current = requestKey;

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      abortRef.current?.abort();
      abortRef.current = null;
      setCorrection(null);

      const requestId = ++requestIdRef.current;
      const debounceMs = Math.min(400, currentPrefs.debounceMs);
      debounceTimer.current = setTimeout(async () => {
        if (requestId !== requestIdRef.current) return;
        const latestPrefs = prefsRef.current;
        if (!latestPrefs?.autoCorrectEnabled) return;
        const latestModel = resolveActiveModel(latestPrefs);
        if (!latestModel) return;

        const controller = new AbortController();
        abortRef.current = controller;
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
            requestId !== requestIdRef.current ||
            controller.signal.aborted ||
            !result.replacement
          ) {
            return;
          }

          setCorrection({
            id: `${requestId}:${request.from}:${request.word}`,
            original: request.word,
            replacement: result.replacement,
            from: request.from,
            to: request.to,
          });
        } catch (error) {
          if (requestId !== requestIdRef.current || isAbortError(error)) return;
          const message = error instanceof Error ? error.message : String(error);
          console.error("[textSuggest] correction error", {
            requestId,
            word: request.word,
            error,
          });
          setState({ kind: "error", message });
        }
      }, debounceMs);
    },
    [prefsRef, setState],
  );

  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      abortRef.current?.abort();
    },
    [],
  );

  return { correction, requestCorrection, clearCorrection };
}
