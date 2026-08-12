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

export function buildProofreadingMessages(
  documentChunk: string,
  instruction: string,
): ChatMessage[] {
  const system = [
    "You are a document proofreader inside a Markdown editor.",
    "Apply the user's instruction to the supplied document chunk.",
    "Preserve every part of the content unless the instruction requires changing it.",
    "Preserve Markdown structure, links, custom HTML elements, code, and formatting.",
    "Never add commentary, explanations, labels, quotation marks, or code fences.",
    "Output only the complete revised document chunk.",
  ].join(" ");
  return [
    { role: "system", content: system },
    {
      role: "user",
      content:
        `Instruction:\n${instruction.trim()}\n\n` +
        `<document>\n${documentChunk}\n</document>`,
    },
  ];
}
