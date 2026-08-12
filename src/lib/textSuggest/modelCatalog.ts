import type { TextSuggestModelEntry, TextSuggestPrefs } from "./types";

export interface RecommendedGGUFModel {
  id: string;
  name: string;
  badge: string;
  size: string;
  description: string;
  downloadUrl: string;
  detailsUrl: string;
}

export const RECOMMENDED_GGUF_MODELS: readonly RecommendedGGUFModel[] = [
  {
    id: "smollm2-360m-instruct-q8",
    name: "SmolLM2 360M Instruct",
    badge: "Smallest",
    size: "386 MB",
    description:
      "The lightest option for lower-memory phones. It loads faster, but its suggestions may be less accurate.",
    downloadUrl:
      "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q8_0.gguf?download=true",
    detailsUrl:
      "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF",
  },
  {
    id: "qwen2.5-0.5b-instruct-q4-k-m",
    name: "Qwen2.5 0.5B Instruct",
    badge: "Recommended",
    size: "491 MB",
    description:
      "A good speed and quality balance for text suggestions on most recent phones and computers.",
    downloadUrl:
      "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf?download=true",
    detailsUrl:
      "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF",
  },
  {
    id: "qwen2.5-1.5b-instruct-q4-k-m",
    name: "Qwen2.5 1.5B Instruct",
    badge: "Better quality",
    size: "1.12 GB",
    description:
      "A larger, slower model for stronger suggestions. Best on desktops and higher-memory phones.",
    downloadUrl:
      "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf?download=true",
    detailsUrl:
      "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF",
  },
];

export function makeModelId(url: string): `custom:${string}` {
  const slug = url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .slice(0, 80);
  return `custom:${slug}-${Date.now().toString(36)}`;
}

export function resolveActiveModel(
  prefs: TextSuggestPrefs,
): TextSuggestModelEntry | null {
  if (!prefs.activeModelId) return null;
  return prefs.models.find((m) => m.id === prefs.activeModelId) ?? null;
}

export function suggestedLabel(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    return last ?? url;
  } catch {
    return url;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
