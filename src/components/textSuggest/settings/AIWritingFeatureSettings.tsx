import {
  FormControlLabel,
  Switch,
  Typography,
} from "@mui/material";
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
        A local AI model can suggest the next few words and check completed
        words for likely typos. Press <strong>Tab</strong> or tap the ghost text
        to accept, <strong>Esc</strong> to dismiss.
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
      <FormControlLabel
        sx={{ display: "flex", mb: 0.25 }}
        control={
          <Switch
            checked={prefs.autoCorrectEnabled}
            onChange={(event) =>
              onPatch({ autoCorrectEnabled: event.target.checked })
            }
          />
        }
        label="Enable AI autocorrection"
      />
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", ml: 6, mb: 2 }}
      >
        Checks completed words with the GGUF model. Tap a red squiggly word to
        apply its correction. It can run together with text suggestions; typo
        checks are queued first.
      </Typography>
    </>
  );
}
