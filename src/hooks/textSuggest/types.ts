import type {
  ProofreadResult,
  TextSuggestPrefs,
  TextSuggestState,
} from "../../lib/textSuggest/types";

/** Suggestion text plus the editor cursor position it was requested for. */
export interface TextSuggestion {
  text: string;
  pos: number;
}

export interface UseTextSuggestReturn {
  state: TextSuggestState;
  prefs: TextSuggestPrefs | null;
  suggestion: TextSuggestion | null;
  requestSuggestion: (prefix: string, cursorPos: number) => void;
  clearSuggestion: () => void;
  proofread: (document: string, instruction: string) => Promise<ProofreadResult>;
  notifyCursorPos: (cursorPos: number) => void;
  reload: () => Promise<void>;
  updatePrefs: (next: TextSuggestPrefs) => Promise<void>;
  loadModelFromFile: (file: File) => Promise<void>;
  removeActiveModel: () => Promise<void>;
}
