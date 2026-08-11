import type { CorrectWordRequest } from "../types";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export function buildSuggestionMessages(
  prefix: string,
  maxTokens: number,
): ChatMessage[] {
  const approxWords = Math.max(4, Math.round(maxTokens * 0.7));
  const system = [
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
  const tail = prefix.slice(-800);
  const user =
    `Document text up to the cursor:\n---\n${tail}\n---\n` +
    `Continue from the end with ~${approxWords} words. Continuation only:`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function buildCorrectionMessages(req: CorrectWordRequest): ChatMessage[] {
  const system = [
    "You are a conservative spelling and typing-error checker.",
    "Given one candidate word and its nearby document context, output the corrected single word only.",
    "Preserve the language and intended capitalization.",
    "Do not rewrite grammar or expand abbreviations.",
    "If the word is already correct, is a name, slang, technical term, abbreviation, or you are unsure, output SAME.",
    "Never output punctuation, quotes, JSON, or an explanation.",
  ].join(" ");
  const context = req.context.slice(-500);
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `Context:\n---\n${context}\n---\nCandidate word: ${req.word}`,
    },
  ];
}
