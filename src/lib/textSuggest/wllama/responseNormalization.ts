export function normalizeContinuation(text: string, prefix: string): string {
  let output = text
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
  if (echo && output.toLowerCase().startsWith(echo.toLowerCase())) {
    output = output.slice(echo.length);
  }

  const blankLine = output.search(/\n\s*\n/);
  if (blankLine !== -1) output = output.slice(0, blankLine);
  output = output.replace(/\n+/g, " ").replace(/\s+$/, "");

  const trimmedPrefix = prefix.replace(/\s+$/, "");
  const midSentence =
    trimmedPrefix.length > 0 && !/[.!?…]"?$/.test(trimmedPrefix);
  if (midSentence) output = output.replace(/[.!?]+["']?\s*$/, "");

  if (
    output &&
    prefix.length > 0 &&
    !/\s$/.test(prefix) &&
    !/^\s/.test(output)
  ) {
    output = ` ${output}`;
  }
  return output;
}

export function normalizeProofreading(
  text: string,
  originalChunk: string,
): string {
  let output = text.replace(/\r/g, "").trim();
  output = output
    .replace(/^```(?:markdown|md|text)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .replace(/^\s*(?:revised|proofread|corrected)\s+(?:text|document)\s*:\s*/i, "")
    .replace(/^<document>\s*\n?/i, "")
    .replace(/\n?\s*<\/document>$/i, "")
    .trim();

  if (!output) return originalChunk;

  const leading = originalChunk.match(/^\s*/)?.[0] ?? "";
  const trailing = originalChunk.match(/\s*$/)?.[0] ?? "";
  return `${leading}${output}${trailing}`;
}
