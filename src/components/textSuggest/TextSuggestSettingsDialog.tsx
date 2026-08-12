import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Box,
} from "@mui/material";
import { AddGGUFModelSection } from "./settings/AddGGUFModelSection";
import { AIWritingFeatureSettings } from "./settings/AIWritingFeatureSettings";
import { ConfiguredModelList } from "./settings/ConfiguredModelList";
import { SuggestionBehaviorSettings } from "./settings/SuggestionBehaviorSettings";
import { useTextSuggestSettings } from "./settings/useTextSuggestSettings";
import type { ProofreadStatus } from "../../hooks/textSuggest/useProofreadRequest";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
  documentLength: number;
  proofreadStatus: ProofreadStatus;
  onProofread: (instruction: string) => Promise<void>;
  onCancelProofread: () => void;
}

export default function TextSuggestSettingsDialog({
  open,
  onClose,
  onSaved,
  documentLength,
  proofreadStatus,
  onProofread,
  onCancelProofread,
}: Props) {
  const settings = useTextSuggestSettings(open, onSaved);
  const { prefs } = settings;

  if (!prefs) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogContent sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={proofreadStatus.kind === "running" ? undefined : onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Local AI writing</DialogTitle>
      <DialogContent>
        <AIWritingFeatureSettings
          prefs={prefs}
          onPatch={(patch) => void settings.patchPrefs(patch)}
          documentLength={documentLength}
          proofreadStatus={proofreadStatus}
          onProofread={onProofread}
          onCancelProofread={onCancelProofread}
        />
        <Box
          component="fieldset"
          disabled={proofreadStatus.kind === "running"}
          sx={{
            m: 0,
            p: 0,
            minWidth: 0,
            border: 0,
            opacity: proofreadStatus.kind === "running" ? 0.55 : 1,
          }}
        >
          <Divider sx={{ mb: 2 }} />
          <ConfiguredModelList
            prefs={prefs}
            busyId={settings.busyId}
            onSelect={(id) => void settings.selectModel(id)}
            onRemove={(id) => void settings.removeModel(id)}
          />
          <Divider sx={{ mb: 2 }} />
          <AddGGUFModelSection
            loading={settings.loading}
            progress={settings.loadingProgress}
            onFile={settings.addModelFromFile}
          />
          <SuggestionBehaviorSettings
            prefs={prefs}
            onPreview={settings.previewPrefs}
            onCommit={(patch) => void settings.patchPrefs(patch)}
          />
        </Box>
        {settings.error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {settings.error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={proofreadStatus.kind === "running"}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
