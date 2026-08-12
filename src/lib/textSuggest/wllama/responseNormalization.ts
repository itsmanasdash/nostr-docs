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

export function normalizeCorrection(
  text: string,
  original: string,
): string | null {
  let replacement = text
    .replace(/\r/g, "")
    .split("\n", 1)[0]
    .replace(/^\s*(?:correction|corrected word|replacement)\s*:\s*/i, "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.,;:!?]+$/, "")
    .trim();

  if (/^(?:same|unchanged|correct|none)$/i.test(replacement)) return null;
  if (replacement.toLocaleLowerCase() === original.toLocaleLowerCase()) {
    return null;
  }
  if (
    !/^[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*$/u.test(replacement) ||
    replacement.length > Math.max(32, original.length * 3)
  ) {
    return null;
  }

  if (original === original.toLocaleUpperCase()) {
    replacement = replacement.toLocaleUpperCase();
  } else if (/^\p{Lu}/u.test(original)) {
    replacement =
      replacement.charAt(0).toLocaleUpperCase() + replacement.slice(1);
  }
  return replacement;
}
