import type { TextSuggestPrefs, TextSuggestState } from "../../lib/textSuggest/types";

/** Suggestion text plus the editor cursor position it was requested for. */
export interface TextSuggestion {
  text: string;
  pos: number;
}

export interface TextCorrection {
  id: string;
  original: string;
  replacement: string;
  from: number;
  to: number;
}

export interface TextCorrectionRequest {
  word: string;
  context: string;
  from: number;
  to: number;
}

export interface UseTextSuggestReturn {
  state: TextSuggestState;
  prefs: TextSuggestPrefs | null;
  suggestion: TextSuggestion | null;
  correction: TextCorrection | null;
  requestSuggestion: (prefix: string, cursorPos: number) => void;
  clearSuggestion: () => void;
  requestCorrection: (request: TextCorrectionRequest) => void;
  clearCorrection: () => void;
  notifyCursorPos: (cursorPos: number) => void;
  reload: () => Promise<void>;
  updatePrefs: (next: TextSuggestPrefs) => Promise<void>;
  loadModelFromFile: (file: File) => Promise<void>;
  removeActiveModel: () => Promise<void>;
}
