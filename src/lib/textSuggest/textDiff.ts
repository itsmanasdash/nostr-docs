import diffSequence from "diff-sequences";

export type TextDiffPart = {
  type: "equal" | "delete" | "insert";
  text: string;
};

function tokenize(text: string): string[] {
  return (
    text.match(
      /\s+|[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*|[^\s]/gu,
    ) ?? []
  );
}

function append(parts: TextDiffPart[], type: TextDiffPart["type"], text: string) {
  if (!text) return;
  const previous = parts.at(-1);
  if (previous?.type === type) {
    previous.text += text;
  } else {
    parts.push({ type, text });
  }
}

export function diffText(before: string, after: string): TextDiffPart[] {
  if (before === after) return before ? [{ type: "equal", text: before }] : [];

  const a = tokenize(before);
  const b = tokenize(after);
  const parts: TextDiffPart[] = [];
  let aIndex = 0;
  let bIndex = 0;

  diffSequence(
    a.length,
    b.length,
    (left, right) => a[left] === b[right],
    (commonLength, commonA, commonB) => {
      append(parts, "delete", a.slice(aIndex, commonA).join(""));
      append(parts, "insert", b.slice(bIndex, commonB).join(""));
      append(parts, "equal", a.slice(commonA, commonA + commonLength).join(""));
      aIndex = commonA + commonLength;
      bIndex = commonB + commonLength;
    },
  );

  append(parts, "delete", a.slice(aIndex).join(""));
  append(parts, "insert", b.slice(bIndex).join(""));
  return parts;
}
