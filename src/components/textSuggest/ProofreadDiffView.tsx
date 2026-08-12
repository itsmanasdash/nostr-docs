import { useEffect, useMemo, useRef } from "react";
import { Box, Button, Chip, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import DifferenceIcon from "@mui/icons-material/Difference";
import { diffText } from "../../lib/textSuggest/textDiff";

interface Props {
  before: string;
  after: string;
  instruction: string;
  onAccept: () => void;
  onReject: () => void;
}

export function ProofreadDiffView({
  before,
  after,
  instruction,
  onAccept,
  onReject,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const parts = useMemo(() => diffText(before, after), [before, after]);
  const additions = parts.filter((part) => part.type === "insert").length;
  const removals = parts.filter((part) => part.type === "delete").length;

  useEffect(() => headingRef.current?.focus(), []);

  return (
    <Box
      aria-label="Proofreading changes"
      sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
    >
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 1,
          display: "flex",
          alignItems: { xs: "stretch", sm: "center" },
          flexDirection: { xs: "column", sm: "row" },
          gap: 1,
          px: { xs: 2, sm: 3 },
          py: 1.5,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            ref={headingRef}
            tabIndex={-1}
            variant="subtitle1"
            sx={{ display: "flex", alignItems: "center", gap: 0.75, fontWeight: 700 }}
          >
            <DifferenceIcon fontSize="small" color="secondary" />
            Review AI changes
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {instruction}
          </Typography>
        </Box>
        <Box
          sx={{
            display: "flex",
            gap: 1,
            flexDirection: { xs: "column-reverse", sm: "row" },
            "& .MuiButton-root": { width: { xs: "100%", sm: "auto" } },
          }}
        >
          <Button onClick={onReject} startIcon={<CloseIcon />}>
            Reject
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={onAccept}
            startIcon={<CheckIcon />}
          >
            Accept changes
          </Button>
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", px: { xs: 2, sm: 3 }, py: 2.5 }}>
        <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
          <Chip size="small" label={`${additions} added block${additions === 1 ? "" : "s"}`} color="success" variant="outlined" />
          <Chip size="small" label={`${removals} removed block${removals === 1 ? "" : "s"}`} color="error" variant="outlined" />
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
            Markdown preview — the editor is unchanged until you accept.
          </Typography>
        </Box>
        <Box
          component="pre"
          aria-label="Document diff"
          sx={{
            m: 0,
            p: 2,
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "action.hover",
            color: "text.primary",
            fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, monospace',
            fontSize: "0.88rem",
            lineHeight: 1.75,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {parts.map((part, index) => {
            if (part.type === "delete") {
              return (
                <Box
                  component="del"
                  key={index}
                  sx={{ bgcolor: "rgba(244,67,54,0.18)", color: "error.main" }}
                >
                  {part.text}
                </Box>
              );
            }
            if (part.type === "insert") {
              return (
                <Box
                  component="ins"
                  key={index}
                  sx={{
                    bgcolor: "rgba(76,175,80,0.2)",
                    color: "success.main",
                    textDecoration: "none",
                    borderBottom: "2px solid",
                  }}
                >
                  {part.text}
                </Box>
              );
            }
            return <span key={index}>{part.text}</span>;
          })}
        </Box>
      </Box>
    </Box>
  );
}
