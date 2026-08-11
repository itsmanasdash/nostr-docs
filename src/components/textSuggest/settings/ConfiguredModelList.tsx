import {
  Alert,
  CircularProgress,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import type {
  TextSuggestModelId,
  TextSuggestPrefs,
} from "../../../lib/textSuggest/types";

interface Props {
  prefs: TextSuggestPrefs;
  busyId: string | null;
  onSelect: (id: TextSuggestModelId) => void;
  onRemove: (id: TextSuggestModelId) => void;
}

export function ConfiguredModelList({
  prefs,
  busyId,
  onSelect,
  onRemove,
}: Props) {
  return (
    <>
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ display: "block", mb: 0.5 }}
      >
        Your models
      </Typography>
      {prefs.models.length === 0 ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          No model configured yet.
        </Alert>
      ) : (
        <List dense disablePadding sx={{ mb: 2 }}>
          {prefs.models.map((model) => {
            const active = prefs.activeModelId === model.id;
            return (
              <ListItemButton
                key={model.id}
                selected={active}
                onClick={() => onSelect(model.id)}
                sx={{ borderRadius: 1 }}
              >
                {active ? (
                  <CheckCircleIcon
                    fontSize="small"
                    color="primary"
                    sx={{ mr: 1.5 }}
                  />
                ) : (
                  <RadioButtonUncheckedIcon
                    fontSize="small"
                    sx={{ mr: 1.5, opacity: 0.4 }}
                  />
                )}
                <ListItemText
                  primary={model.label}
                  secondary={model.url}
                  secondaryTypographyProps={{
                    sx: {
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    },
                  }}
                />
                <IconButton
                  edge="end"
                  size="small"
                  disabled={busyId === model.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(model.id);
                  }}
                  title="Remove model"
                >
                  {busyId === model.id ? (
                    <CircularProgress size={16} />
                  ) : (
                    <DeleteIcon fontSize="small" />
                  )}
                </IconButton>
              </ListItemButton>
            );
          })}
        </List>
      )}
    </>
  );
}
