import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  TextField,
  Typography,
} from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";

interface Props {
  instruction: string;
  modelConfigured: boolean;
  hasDocumentText: boolean;
  onPreview: (instruction: string) => void;
  onCommit: (instruction: string) => void;
  onRun: (instruction: string) => Promise<void>;
}

export function ProofreadingSettings({
  instruction,
  modelConfigured,
  hasDocumentText,
  onPreview,
  onCommit,
  onRun,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    setBusy(true);
    setError(null);
    try {
      await onRun(instruction);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ display: "block", mb: 0.5 }}
      >
        Proofreading
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mb: 1 }}
      >
        Tell the model what to do with the complete document. Autocorrection is
        one option—for example, ask it to fix spelling and grammar—or request a
        different tone, clearer wording, or another revision.
      </Typography>
      <TextField
        fullWidth
        multiline
        minRows={2}
        label="What should AI do?"
        value={instruction}
        disabled={busy}
        onChange={(event) => onPreview(event.target.value)}
        onBlur={() => onCommit(instruction)}
        slotProps={{ htmlInput: { maxLength: 500 } }}
        helperText={`${instruction.length}/500 characters`}
        sx={{ mb: 1 }}
      />
      <Button
        variant="contained"
        startIcon={
          busy ? <CircularProgress size={16} color="inherit" /> : <AutoFixHighIcon />
        }
        disabled={
          busy ||
          !modelConfigured ||
          !hasDocumentText ||
          !instruction.trim()
        }
        onClick={() => void handleRun()}
      >
        {busy ? "Proofreading…" : "Proofread document"}
      </Button>
      {!modelConfigured && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 0.75 }}
        >
          Choose a GGUF model below before proofreading.
        </Typography>
      )}
      {modelConfigured && !hasDocumentText && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 0.75 }}
        >
          Add some text to the document before proofreading.
        </Typography>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
