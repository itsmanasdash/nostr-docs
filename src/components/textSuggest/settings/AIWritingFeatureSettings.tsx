import { FormControlLabel, Switch, Typography } from "@mui/material";
import type { TextSuggestPrefs } from "../../../lib/textSuggest/types";
import { RuntimeCapabilities } from "../RuntimeCapabilities";

interface Props {
  prefs: TextSuggestPrefs;
  onPatch: (patch: Partial<TextSuggestPrefs>) => void;
}

export function AIWritingFeatureSettings({ prefs, onPatch }: Props) {
  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        A local AI model can suggest the next few words while you type and
        revise the complete document when you ask it to proofread. Press{" "}
        <strong>Tab</strong> or tap ghost text to accept a suggestion, and{" "}
        <strong>Esc</strong> to dismiss it.
      </Typography>

      <RuntimeCapabilities />
      <FormControlLabel
        sx={{ mb: 0.5 }}
        control={
          <Switch
            checked={prefs.enabled}
            onChange={(event) => onPatch({ enabled: event.target.checked })}
          />
        }
        label="Enable text suggestions"
      />
    </>
  );
}
