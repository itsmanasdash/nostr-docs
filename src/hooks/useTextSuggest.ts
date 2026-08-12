import { useCallback, useEffect, useRef, useState } from "react";
import { loadPrefs, savePrefs } from "../lib/textSuggest/prefs";
import { makeModelId, resolveActiveModel } from "../lib/textSuggest/modelCatalog";
import { textSuggestService } from "../lib/textSuggest/wllamaService";
import type {
  ProofreadResult,
  TextSuggestModelEntry,
  TextSuggestPrefs,
  TextSuggestState,
} from "../lib/textSuggest/types";
import { useSuggestionRequest } from "./textSuggest/useSuggestionRequest";
import type { UseTextSuggestReturn } from "./textSuggest/types";

export type { TextSuggestion } from "./textSuggest/types";

function hasEnabledFeature(prefs: TextSuggestPrefs): boolean {
  return prefs.enabled;
}

function stateForPrefs(prefs: TextSuggestPrefs): TextSuggestState {
  if (!hasEnabledFeature(prefs)) return { kind: "disabled" };
  return resolveActiveModel(prefs) ? { kind: "ready" } : { kind: "needs-setup" };
}

export function useTextSuggest(): UseTextSuggestReturn {
  const [state, setState] = useState<TextSuggestState>({ kind: "disabled" });
  const [prefs, setPrefs] = useState<TextSuggestPrefs | null>(null);
  const prefsRef = useRef<TextSuggestPrefs | null>(null);
  const proofreadAbortRef = useRef<AbortController | null>(null);
  const suggestionRequest = useSuggestionRequest({ prefsRef, setState });
  const clearSuggestion = suggestionRequest.clearSuggestion;

  const applyPrefs = useCallback((next: TextSuggestPrefs) => {
    prefsRef.current = next;
    setPrefs(next);
    setState(stateForPrefs(next));
  }, []);

  useEffect(() => {
    let alive = true;
    void loadPrefs().then((next) => {
      if (alive) applyPrefs(next);
    });
    return () => {
      alive = false;
    };
  }, [applyPrefs]);

  const reload = useCallback(async () => {
    applyPrefs(await loadPrefs());
  }, [applyPrefs]);

  const updatePrefs = useCallback(
    async (next: TextSuggestPrefs) => {
      applyPrefs(next);
      await savePrefs(next);
    },
    [applyPrefs],
  );

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
      models: [...currentPrefs.models, model],
      activeModelId: model.id,
    };

    setState({ kind: "loading" });
    try {
      await textSuggestService.ensureLoadedFromFile(file, model, (progress) => {
        setState({
          kind: "downloading",
          bytes: progress.bytes,
          total: progress.total,
        });
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

    const models = currentPrefs.models.filter(
      (model) => model.id !== currentPrefs.activeModelId,
    );
    const nextPrefs: TextSuggestPrefs = {
      ...currentPrefs,
      enabled: currentPrefs.enabled && models.length > 0,
      models,
      activeModelId: models[0]?.id ?? null,
    };

    prefsRef.current = nextPrefs;
    setPrefs(nextPrefs);
    await savePrefs(nextPrefs);
    await textSuggestService.unload();
    setState(stateForPrefs(nextPrefs));
  }, []);

  const proofread = useCallback(
    async (
      document: string,
      instruction: string,
    ): Promise<ProofreadResult> => {
      const currentPrefs = prefsRef.current ?? (await loadPrefs());
      const model = resolveActiveModel(currentPrefs);
      if (!model || !textSuggestService.isModelLoaded(model.id)) {
        const error = new Error(
          "Model not loaded. Open Local AI settings and choose a GGUF file.",
        );
        setState({ kind: "error", message: error.message });
        throw error;
      }
      if (!document.trim()) throw new Error("The document is empty.");
      if (!instruction.trim()) {
        throw new Error("Enter what the proofreader should do.");
      }

      clearSuggestion();
      proofreadAbortRef.current?.abort();
      const controller = new AbortController();
      proofreadAbortRef.current = controller;
      setState({ kind: "thinking" });
      try {
        const result = await textSuggestService.proofread(
          { document, instruction: instruction.trim() },
          { abortSignal: controller.signal },
        );
        if (proofreadAbortRef.current === controller) {
          setState(stateForPrefs(prefsRef.current ?? currentPrefs));
        }
        return result;
      } catch (cause) {
        if (controller.signal.aborted) throw cause;
        const message = cause instanceof Error ? cause.message : String(cause);
        setState({ kind: "error", message });
        throw cause;
      } finally {
        if (proofreadAbortRef.current === controller) {
          proofreadAbortRef.current = null;
        }
      }
    },
    [clearSuggestion],
  );

  useEffect(
    () => () => {
      proofreadAbortRef.current?.abort();
    },
    [],
  );

  return {
    state,
    prefs,
    ...suggestionRequest,
    proofread,
    reload,
    updatePrefs,
    loadModelFromFile,
    removeActiveModel,
  };
}

export type TextSuggestHook = ReturnType<typeof useTextSuggest>;
