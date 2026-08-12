import { useRef, type ChangeEvent } from "react";
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Typography,
} from "@mui/material";
import type { LoadProgress } from "../../../lib/textSuggest/wllamaService";
import { RecommendedModelList } from "./RecommendedModelList";

interface Props {
  loading: boolean;
  progress: LoadProgress | null;
  onFile: (file: File) => Promise<void>;
}

export function AddGGUFModelSection({ loading, progress, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await onFile(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const percent =
    progress && progress.total > 0
      ? (progress.bytes / progress.total) * 100
      : undefined;

  return (
    <>
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ display: "block", mb: 0.5 }}
      >
        Add a model
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        Download a model below, return here, then choose the downloaded
        <strong> .gguf</strong> file. Models run locally and are not uploaded.
      </Alert>
      <RecommendedModelList />
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mb: 1 }}
      >
        Already have a GGUF? Choose it from your device. For other models, look
        for an instruct or chat GGUF and prefer a Q4_K_M quantization.
      </Typography>
      <Box>
        <input
          ref={inputRef}
          type="file"
          accept=".gguf"
          onChange={handleFile}
          style={{ display: "none" }}
          disabled={loading}
        />
        <Button
          variant="contained"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
        >
          Choose downloaded GGUF
        </Button>
      </Box>
      {loading && progress && (
        <Box sx={{ mt: 2 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 1 }}
          >
            Loading model… {Math.round(percent ?? 0)}%
          </Typography>
          <LinearProgress
            variant={percent === undefined ? "indeterminate" : "determinate"}
            value={percent}
          />
        </Box>
      )}
    </>
  );
}
