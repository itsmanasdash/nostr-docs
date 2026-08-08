export { textSuggestService } from "./wllamaService";
export {
  checkLocalAIEnvironment,
  hasWorkingWebGPU,
  isMobileLocalAIRuntime,
  shouldUseWebGPUForLocalAI,
} from "./environment";
export type { LocalAIEnvironment } from "./environment";
export { loadPrefs, savePrefs } from "./prefs";
export {
  makeModelId,
  resolveActiveModel,
  suggestedLabel,
  formatBytes,
} from "./modelCatalog";
export * from "./types";
