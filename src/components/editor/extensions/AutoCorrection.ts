import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";

export interface AutoCorrectionItem {
  id: string;
  original: string;
  replacement: string;
  from: number;
  to: number;
}

interface AutoCorrectionState {
  items: AutoCorrectionItem[];
}

type AutoCorrectionMeta =
  | { type: "add"; item: AutoCorrectionItem }
  | { type: "remove"; id: string }
  | { type: "clear" };

export const autoCorrectionPluginKey = new PluginKey<AutoCorrectionState>(
  "autoCorrection",
);

function textStillMatches(
  view: Pick<EditorView, "state">,
  item: AutoCorrectionItem,
): boolean {
  return (
    item.from >= 0 &&
    item.to <= view.state.doc.content.size &&
    item.from < item.to &&
    view.state.doc.textBetween(item.from, item.to, "") === item.original
  );
}

function correctionIdFromEvent(event: Event): string | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target
    .closest<HTMLElement>("[data-ai-correction-id]")
    ?.dataset.aiCorrectionId ?? null;
}

function acceptCorrection(view: EditorView, id: string): boolean {
  const state = autoCorrectionPluginKey.getState(view.state);
  const item = state?.items.find((candidate) => candidate.id === id);
  if (!item || !textStillMatches(view, item)) return false;

  const tr = view.state.tr
    .insertText(item.replacement, item.from, item.to)
    .setMeta(autoCorrectionPluginKey, { type: "remove", id });
  view.dispatch(tr);
  view.focus();
  return true;
}

function handleCorrectionPointer(view: EditorView, event: Event): boolean {
  const id = correctionIdFromEvent(event);
  if (!id) return false;
  if (typeof PointerEvent !== "undefined" && event instanceof PointerEvent) {
    if (!event.isPrimary) return false;
    if (event.pointerType === "mouse" && event.button !== 0) return false;
  }
  event.preventDefault();
  event.stopPropagation();
  return acceptCorrection(view, id);
}

export const AutoCorrection = Extension.create({
  name: "autoCorrection",
  priority: 190,

  addProseMirrorPlugins() {
    return [
      new Plugin<AutoCorrectionState>({
        key: autoCorrectionPluginKey,
        state: {
          init() {
            return { items: [] };
          },
          apply(tr, previous) {
            let items = previous.items;

            if (tr.docChanged) {
              items = items
                .map((item) => ({
                  ...item,
                  from: tr.mapping.map(item.from, 1),
                  to: tr.mapping.map(item.to, -1),
                }))
                .filter(
                  (item) =>
                    item.from < item.to &&
                    tr.doc.textBetween(item.from, item.to, "") ===
                      item.original,
                );
            }

            const meta = tr.getMeta(autoCorrectionPluginKey) as
              | AutoCorrectionMeta
              | undefined;
            if (!meta) return { items };
            if (meta.type === "clear") return { items: [] };
            if (meta.type === "remove") {
              return {
                items: items.filter((item) => item.id !== meta.id),
              };
            }

            const { item } = meta;
            if (
              item.from >= item.to ||
              tr.doc.textBetween(item.from, item.to, "") !== item.original
            ) {
              return { items };
            }

            return {
              items: [
                ...items.filter(
                  (existing) =>
                    existing.id !== item.id &&
                    (existing.to <= item.from || existing.from >= item.to),
                ),
                item,
              ],
            };
          },
        },
        props: {
          decorations(state) {
            const correctionState = autoCorrectionPluginKey.getState(state);
            if (!correctionState?.items.length) return null;
            return DecorationSet.create(
              state.doc,
              correctionState.items.map((item) =>
                Decoration.inline(
                  item.from,
                  item.to,
                  {
                    class: "ai-auto-correction",
                    "data-ai-correction-id": item.id,
                    title: `Tap to replace with “${item.replacement}”`,
                    role: "button",
                    "aria-label": `Replace ${item.original} with ${item.replacement}`,
                  },
                  { inclusiveStart: false, inclusiveEnd: false },
                ),
              ),
            );
          },
          handleDOMEvents: {
            pointerdown: handleCorrectionPointer,
            click: handleCorrectionPointer,
          },
        },
      }),
    ];
  },
});

export function addAutoCorrection(
  view: EditorView,
  item: AutoCorrectionItem,
): void {
  if (!textStillMatches(view, item)) return;
  const tr = view.state.tr.setMeta(autoCorrectionPluginKey, {
    type: "add",
    item,
  });
  tr.setMeta("addToHistory", false);
  view.dispatch(tr);
}

export function clearAutoCorrections(view: EditorView): void {
  const state = autoCorrectionPluginKey.getState(view.state);
  if (!state?.items.length) return;
  const tr = view.state.tr.setMeta(autoCorrectionPluginKey, { type: "clear" });
  tr.setMeta("addToHistory", false);
  view.dispatch(tr);
}

/** Find the word immediately before the delimiter just typed. */
export function findCompletedWord(
  textBeforeCursor: string,
  cursorPos: number,
): Pick<AutoCorrectionItem, "original" | "from" | "to"> | null {
  const match = textBeforeCursor.match(
    /([\p{L}\p{M}](?:[\p{L}\p{M}'’-]*[\p{L}\p{M}])?)[^\p{L}\p{M}'’-]+$/u,
  );
  if (!match || match[1].length < 3 || match.index === undefined) return null;

  const original = match[1];
  const from = cursorPos - (textBeforeCursor.length - match.index);
  return { original, from, to: from + original.length };
}
