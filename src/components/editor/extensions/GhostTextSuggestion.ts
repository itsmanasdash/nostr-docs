import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";

export interface GhostSuggestionState {
  text: string | null;
  pos: number;
}

export const ghostSuggestionPluginKey = new PluginKey<GhostSuggestionState>(
  "ghostTextSuggestion",
);

export interface GhostTextSuggestionOptions {
  onAccept?: (text: string) => void;
  onDismiss?: () => void;
}

export const GhostTextSuggestion = Extension.create<GhostTextSuggestionOptions>({
  name: "ghostTextSuggestion",
  priority: 200,

  addOptions() {
    return {
      onAccept: undefined,
      onDismiss: undefined,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      new Plugin<GhostSuggestionState>({
        key: ghostSuggestionPluginKey,

        state: {
          init() {
            return { text: null, pos: -1 };
          },
          apply(tr, prev) {
            const meta = tr.getMeta(ghostSuggestionPluginKey) as
              | GhostSuggestionState
              | undefined;
            if (meta) return meta;
            // Any other transaction (typing, cursor move, etc.) invalidates
            // a stale suggestion rather than letting it silently drift to
            // the wrong position.
            if (tr.docChanged || tr.selectionSet) {
              return { text: null, pos: -1 };
            }
            return prev;
          },
        },

        props: {
          decorations(state) {
            const ghost = ghostSuggestionPluginKey.getState(state);
            if (!ghost?.text) return null;
            // Only render when the cursor is still exactly where the
            // suggestion was generated for — prevents ghost text floating
            // at the wrong spot after an out-of-band change.
            const { selection } = state;
            if (!selection.empty || selection.from !== ghost.pos) return null;

            const suggestionText = ghost.text;

            return DecorationSet.create(state.doc, [
              Decoration.widget(
                ghost.pos,
                (view) => {
                  const widget = document.createElement("span");
                  widget.className = "ai-ghost-suggestion";
                  widget.textContent = suggestionText;
                  widget.setAttribute("contenteditable", "false");
                  widget.setAttribute("role", "button");
                  widget.setAttribute("aria-label", "Accept suggested text");
                  widget.setAttribute("title", "Tap to accept");

                  const accept = () => {
                    const accepted = acceptGhostSuggestion(
                      view,
                      suggestionText,
                      ghost.pos,
                    );
                    if (accepted) options.onAccept?.(suggestionText);
                  };

                  widget.addEventListener("pointerdown", (e) => {
                    if (!e.isPrimary) return;
                    if (e.pointerType === "mouse" && e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    accept();
                  });
                  // Some mobile WebViews and assistive technologies emit a
                  // click without a preceding pointer event.
                  widget.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    accept();
                  });
                  return widget;
                },
                {
                  side: 1,
                  key: `ghost:${ghost.pos}:${suggestionText}`,
                },
              ),
            ]);
          },

          handleKeyDown(view, event) {
            const ghost = ghostSuggestionPluginKey.getState(view.state);
            if (!ghost?.text) return false;

            if (event.key === "Tab") {
              event.preventDefault();
              if (acceptGhostSuggestion(view, ghost.text, ghost.pos)) {
                options.onAccept?.(ghost.text);
              }
              return true;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              clearGhostSuggestion(view);
              options.onDismiss?.();
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});

/** Imperatively show a ghost suggestion at a specific cursor position. */
export function setGhostSuggestion(
  view: EditorView,
  text: string,
  pos: number,
): void {
  // Only show if the caret is still where this suggestion was requested.
  const { selection } = view.state;
  if (!selection.empty || selection.from !== pos) return;

  const tr = view.state.tr.setMeta(ghostSuggestionPluginKey, { text, pos });
  // Don't let this show up as a doc-changing/undo-able transaction — it's
  // purely a decoration update.
  tr.setMeta("addToHistory", false);
  view.dispatch(tr);
}

/** Imperatively clear any ghost suggestion currently showing. */
export function clearGhostSuggestion(view: EditorView): void {
  const current = ghostSuggestionPluginKey.getState(view.state);
  if (!current?.text) return;
  const tr = view.state.tr.setMeta(ghostSuggestionPluginKey, {
    text: null,
    pos: -1,
  });
  tr.setMeta("addToHistory", false);
  view.dispatch(tr);
}

function acceptGhostSuggestion(
  view: EditorView,
  text: string,
  pos: number,
): boolean {
  const current = ghostSuggestionPluginKey.getState(view.state);
  const { selection } = view.state;
  if (
    current?.text !== text ||
    current.pos !== pos ||
    !selection.empty ||
    selection.from !== pos
  ) {
    return false;
  }

  const tr = view.state.tr
    .insertText(text, pos)
    .setMeta(ghostSuggestionPluginKey, { text: null, pos: -1 });
  view.dispatch(tr);
  view.focus();
  return true;
}
