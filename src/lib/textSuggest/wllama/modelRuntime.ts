import { Wllama } from "@wllama/wllama/esm/index.js";
import { shouldUseWebGPUForLocalAI } from "../environment";
import { createCacheManager } from "./cacheManager";

export interface LoadProgress {
  bytes: number;
  total: number;
}

const WASM_PATH = "/wllama/wllama.wasm";
const CONTEXT_SIZE = 2048;
const GPU_LAYERS = 999;

export async function loadWllamaModel(
  file: File,
  modelLabel: string,
  onProgress?: (progress: LoadProgress) => void,
): Promise<Wllama> {
  const llm = new Wllama(
    { default: WASM_PATH },
    { cacheManager: createCacheManager() },
  );
  try {
    const useWebGPU = shouldUseWebGPUForLocalAI();
    onProgress?.({ bytes: 10, total: 100 });
    onProgress?.({ bytes: 30, total: 100 });
    await llm.loadModel([file], {
      n_ctx: CONTEXT_SIZE,
      // Mobile WebGPU can produce corrupt logits for some architectures,
      // notably Qwen, so mobile inference deliberately uses WASM/CPU.
      n_gpu_layers: useWebGPU ? GPU_LAYERS : 0,
      jinja: true,
    });
    console.debug("[textSuggest] model loaded", {
      model: modelLabel,
      backend: useWebGPU ? "WebGPU" : "WASM/CPU",
    });
    onProgress?.({ bytes: 100, total: 100 });
    return llm;
  } catch (cause) {
    try {
      await llm.exit();
    } catch {
      // Preserve the original model-loading error.
    }
    throw cause instanceof Error ? cause : new Error("Failed to load model");
  }
}

export async function exitWllama(llm: Wllama | null): Promise<void> {
  if (!llm) return;
  try {
    await llm.exit();
  } catch {
    // Ignore shutdown errors while releasing the current model.
  }
}
