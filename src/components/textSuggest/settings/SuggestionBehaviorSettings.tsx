import { Divider, Slider, Typography } from "@mui/material";
import type { TextSuggestPrefs } from "../../../lib/textSuggest/types";

interface Props {
  prefs: TextSuggestPrefs;
  onPreview: (patch: Partial<TextSuggestPrefs>) => void;
  onCommit: (patch: Partial<TextSuggestPrefs>) => void;
}

export function SuggestionBehaviorSettings({
  prefs,
  onPreview,
  onCommit,
}: Props) {
  if (prefs.models.length === 0) return null;
  return (
    <>
      <Divider sx={{ my: 2 }} />
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ display: "block", mb: 1 }}
      >
        Behavior
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Suggest after pausing for {prefs.debounceMs} ms
      </Typography>
      <Slider
        size="small"
        min={200}
        max={1500}
        step={100}
        value={prefs.debounceMs}
        onChange={(_, value) => onPreview({ debounceMs: value as number })}
        onChangeCommitted={(_, value) =>
          onCommit({ debounceMs: value as number })
        }
        sx={{ mb: 2 }}
      />
      <Typography variant="caption" color="text.secondary">
        Suggestion length: up to {prefs.maxTokens} tokens
      </Typography>
      <Slider
        size="small"
        min={8}
        max={128}
        step={8}
        value={prefs.maxTokens}
        onChange={(_, value) => onPreview({ maxTokens: value as number })}
        onChangeCommitted={(_, value) =>
          onCommit({ maxTokens: value as number })
        }
      />
    </>
  );
}
