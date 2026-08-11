import type { Wllama } from "@wllama/wllama/esm/index.js";
import type {
  CorrectWordRequest,
  CorrectWordResult,
  SuggestRequest,
  SuggestResult,
} from "../types";
import { buildCorrectionMessages, buildSuggestionMessages } from "./prompts";
import {
  normalizeContinuation,
  normalizeCorrection,
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

export async function generateCorrection(
  llm: Wllama,
  req: CorrectWordRequest,
  abortSignal?: AbortSignal,
): Promise<CorrectWordResult> {
  const startedAt = performance.now();
  const result = await llm.createChatCompletion({
    messages: buildCorrectionMessages(req),
    stream: false,
    max_tokens: 12,
    temperature: 0,
    top_k: 1,
    top_p: 1,
    abortSignal,
  });
  const rawText = result.choices[0]?.message.content ?? "";
  const replacement = normalizeCorrection(rawText, req.word);
  console.debug("[textSuggest] correction", {
    word: req.word,
    rawText,
    replacement,
    timeMs: performance.now() - startedAt,
  });
  return { replacement, msElapsed: performance.now() - startedAt };
}
