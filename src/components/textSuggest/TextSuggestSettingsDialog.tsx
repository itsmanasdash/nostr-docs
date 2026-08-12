import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
} from "@mui/material";
import { AddGGUFModelSection } from "./settings/AddGGUFModelSection";
import { AIWritingFeatureSettings } from "./settings/AIWritingFeatureSettings";
import { ConfiguredModelList } from "./settings/ConfiguredModelList";
import { ProofreadingSettings } from "./settings/ProofreadingSettings";
import { SuggestionBehaviorSettings } from "./settings/SuggestionBehaviorSettings";
import { useTextSuggestSettings } from "./settings/useTextSuggestSettings";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onProofread?: (instruction: string) => Promise<void>;
  hasDocumentText?: boolean;
}

const dialogPaperSx = {
  bgcolor: (theme: { palette: { mode: string } }) =>
    theme.palette.mode === "dark" ? "#30323a" : "#f5f5f6",
};

const dialogContentSx = {
  color: "text.primary",
  "& .MuiTypography-colorTextSecondary": {
    color: (theme: { palette: { mode: string } }) =>
      theme.palette.mode === "dark"
        ? "rgba(255,255,255,0.78)"
        : "rgba(0,0,0,0.68)",
  },
};

export default function TextSuggestSettingsDialog({
  open,
  onClose,
  onSaved,
  onProofread,
  hasDocumentText = false,
}: Props) {
  const settings = useTextSuggestSettings(open, onSaved);
  const { prefs } = settings;

  if (!prefs) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: dialogPaperSx } }}
      >
        <DialogContent sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: dialogPaperSx } }}
    >
      <DialogTitle sx={{ fontWeight: 700 }}>Local AI writing</DialogTitle>
      <DialogContent sx={dialogContentSx}>
        <AIWritingFeatureSettings
          prefs={prefs}
          onPatch={(patch) => void settings.patchPrefs(patch)}
        />
        <ProofreadingSettings
          instruction={prefs.proofreadInstruction}
          modelConfigured={prefs.models.length > 0}
          hasDocumentText={hasDocumentText}
          onPreview={(proofreadInstruction) =>
            settings.previewPrefs({ proofreadInstruction })
          }
          onCommit={(proofreadInstruction) =>
            void settings.patchPrefs({ proofreadInstruction })
          }
          onRun={async (instruction) => {
            await settings.patchPrefs({ proofreadInstruction: instruction });
            if (!onProofread) return;
            await onProofread(instruction);
            onClose();
          }}
        />
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
        {settings.error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {settings.error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
