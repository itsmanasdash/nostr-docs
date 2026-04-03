import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
} from "react";
import { useUser } from "./UserContext";
import { useRelays } from "./RelayContext";
import { signerManager } from "../signer";
import { fetchAllDocMetadata, saveDocMetadata } from "../nostr/docMetadata";

interface DocMetadataContextValue {
  docTags: Map<string, string[]>;
  allTags: string[];
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  setDocTags: (address: string, tags: string[]) => Promise<void>;
  loading: boolean;
}

const DocMetadataContext = createContext<DocMetadataContextValue | undefined>(
  undefined,
);

export const DocMetadataProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useUser();
  const { relays } = useRelays();
  const [docTags, setDocTagsState] = useState<Map<string, string[]>>(new Map());
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setDocTagsState(new Map());
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const signer = await signerManager.getSigner();
        if (!signer) return;
        const pubkey = await signer.getPublicKey();
        const metadata = await fetchAllDocMetadata(relays, pubkey);
        const tagsMap = new Map<string, string[]>();
        for (const [address, meta] of metadata) {
          if (meta.tags.length > 0) tagsMap.set(address, meta.tags);
        }
        setDocTagsState(tagsMap);
      } catch (err) {
        console.error("Failed to fetch doc metadata:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, relays]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const tags of docTags.values()) {
      for (const tag of tags) set.add(tag);
    }
    return Array.from(set).sort();
  }, [docTags]);

  const setDocTags = async (address: string, tags: string[]) => {
    await saveDocMetadata(address, { tags }, relays);
    setDocTagsState((prev) => {
      const next = new Map(prev);
      if (tags.length === 0) next.delete(address);
      else next.set(address, tags);
      return next;
    });
  };

  return (
    <DocMetadataContext.Provider
      value={{ docTags, allTags, selectedTag, setSelectedTag, setDocTags, loading }}
    >
      {children}
    </DocMetadataContext.Provider>
  );
};

export const useDocMetadata = () => {
  const context = useContext(DocMetadataContext);
  if (!context)
    throw new Error("useDocMetadata must be used within a DocMetadataProvider");
  return context;
};
