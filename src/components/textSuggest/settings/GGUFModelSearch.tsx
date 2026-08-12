import { useMemo, useState } from "react";
import { Box, Button, TextField, Typography } from "@mui/material";

const HUGGING_FACE_MODELS_URL = "https://huggingface.co/models";

function makeSearchUrl(query: string): string {
  const terms = [query.trim(), "GGUF"].filter(Boolean).join(" ");
  const params = new URLSearchParams({ search: terms, sort: "downloads" });
  return `${HUGGING_FACE_MODELS_URL}?${params.toString()}`;
}

export function GGUFModelSearch() {
  const [query, setQuery] = useState("");
  const searchUrl = useMemo(() => makeSearchUrl(query), [query]);

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        p: 1.5,
        mb: 2,
      }}
    >
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Want a different model?
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mb: 1.25 }}
      >
        Search the Hugging Face catalog. For this editor, choose a single-file
        text-generation Instruct or Chat GGUF; Q4_K_M is a good starting point.
      </Typography>
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: "flex-start",
          gap: 1,
          minWidth: 0,
          width: "100%",
        }}
      >
        <TextField
          fullWidth
          size="small"
          label="Search other GGUF models"
          placeholder="e.g. Llama 3.2 1B Instruct"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          sx={{ minWidth: 0 }}
        />
        <Button
          component="a"
          href={searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="outlined"
          sx={{
            minHeight: 40,
            maxWidth: "100%",
            minWidth: 0,
            overflowWrap: "anywhere",
            whiteSpace: "normal",
            width: { xs: "100%", sm: "auto" },
          }}
        >
          Search Hugging Face
        </Button>
      </Box>
    </Box>
  );
}
