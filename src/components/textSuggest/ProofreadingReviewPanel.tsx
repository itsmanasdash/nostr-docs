import { useMemo } from "react";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { diffText } from "../../lib/textSuggest/textDiff";

export interface ProofreadingReview {
  original: string;
  revised: string;
  instruction: string;
}

interface Props {
  review: ProofreadingReview;
  onAccept: () => void;
  onReject: () => void;
}

export function ProofreadingReviewPanel({
  review,
  onAccept,
  onReject,
}: Props) {
  const parts = useMemo(
    () => diffText(review.original, review.revised),
    [review.original, review.revised],
  );

  return (
    <Box
      role="region"
      aria-label="Proofreading review"
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.default",
        p: { xs: 1.5, sm: 2 },
        flexShrink: 0,
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "stretch", sm: "center" }}
        justifyContent="space-between"
        gap={1}
        sx={{ mb: 1 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2">Proofreading review</Typography>
          <Typography variant="caption" color="text.secondary">
            Removed text is red and added text is green. The editor remains
            unchanged until you accept.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={<CloseIcon />}
            onClick={onReject}
          >
            Reject
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<CheckIcon />}
            onClick={onAccept}
          >
            Accept
          </Button>
        </Stack>
      </Stack>
      <Chip
        size="small"
        label={review.instruction}
        title={review.instruction}
        sx={{ maxWidth: "100%", mb: 1 }}
      />
      <Box
        aria-label="Proofreading changes"
        sx={{
          maxHeight: { xs: 180, sm: 240 },
          overflow: "auto",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: "background.paper",
          p: 1.5,
          fontFamily: "monospace",
          fontSize: "0.82rem",
          lineHeight: 1.65,
          overflowWrap: "anywhere",
          whiteSpace: "pre-wrap",
        }}
      >
        {parts.map((part, index) => (
          <Box
            component={
              part.kind === "added"
                ? "ins"
                : part.kind === "removed"
                  ? "del"
                  : "span"
            }
            key={`${part.kind}:${index}`}
            sx={
              part.kind === "added"
                ? {
                    bgcolor: "success.light",
                    color: "success.contrastText",
                    textDecoration: "none",
                  }
                : part.kind === "removed"
                  ? { bgcolor: "error.light", color: "error.contrastText" }
                  : undefined
            }
          >
            {part.text}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
