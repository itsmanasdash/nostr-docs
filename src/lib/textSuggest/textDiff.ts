export type TextDiffKind = "equal" | "added" | "removed";

export interface TextDiffPart {
  kind: TextDiffKind;
  text: string;
}

const MAX_LCS_CELLS = 1_000_000;

function tokenize(text: string): string[] {
  return text.match(/\s+|[\p{L}\p{M}\p{N}_]+|[^\s]/gu) ?? [];
}

function append(parts: TextDiffPart[], kind: TextDiffKind, text: string) {
  if (!text) return;
  const previous = parts.at(-1);
  if (previous?.kind === kind) previous.text += text;
  else parts.push({ kind, text });
}

export function diffText(original: string, revised: string): TextDiffPart[] {
  if (original === revised) return [{ kind: "equal", text: original }];

  const before = tokenize(original);
  const after = tokenize(revised);
  let prefixLength = 0;
  while (
    prefixLength < before.length &&
    prefixLength < after.length &&
    before[prefixLength] === after[prefixLength]
  ) {
    prefixLength++;
  }

  let suffixLength = 0;
  while (
    suffixLength < before.length - prefixLength &&
    suffixLength < after.length - prefixLength &&
    before[before.length - 1 - suffixLength] ===
      after[after.length - 1 - suffixLength]
  ) {
    suffixLength++;
  }

  const removed = before.slice(prefixLength, before.length - suffixLength);
  const added = after.slice(prefixLength, after.length - suffixLength);
  const parts: TextDiffPart[] = [];
  append(parts, "equal", before.slice(0, prefixLength).join(""));

  if ((removed.length + 1) * (added.length + 1) > MAX_LCS_CELLS) {
    append(parts, "removed", removed.join(""));
    append(parts, "added", added.join(""));
  } else {
    const columns = added.length + 1;
    const table = new Uint32Array((removed.length + 1) * columns);
    for (let left = removed.length - 1; left >= 0; left--) {
      for (let right = added.length - 1; right >= 0; right--) {
        const index = left * columns + right;
        table[index] =
          removed[left] === added[right]
            ? table[(left + 1) * columns + right + 1] + 1
            : Math.max(
                table[(left + 1) * columns + right],
                table[left * columns + right + 1],
              );
      }
    }

    let left = 0;
    let right = 0;
    while (left < removed.length || right < added.length) {
      if (
        left < removed.length &&
        right < added.length &&
        removed[left] === added[right]
      ) {
        append(parts, "equal", removed[left]);
        left++;
        right++;
      } else if (
        left < removed.length &&
        (right === added.length ||
          table[(left + 1) * columns + right] >=
            table[left * columns + right + 1])
      ) {
        append(parts, "removed", removed[left]);
        left++;
      } else {
        append(parts, "added", added[right]);
        right++;
      }
    }
  }

  append(parts, "equal", before.slice(before.length - suffixLength).join(""));
  return parts;
}
