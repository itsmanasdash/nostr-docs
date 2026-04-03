// src/nostr/fetchFile.ts

import type { AddressPointer } from "nostr-tools/nip19";
import { pool } from "./relayPool";
import { nip19, type Event } from "nostr-tools";
import { KIND_FILE } from "./kinds";

export async function fetchAllDocuments(
  relays: string[],
  addDocument: (doc: Event) => void,
  pubkey: string,
): Promise<{ relayMap: Map<string, string[]> }> {
  return new Promise((resolve) => {
    const documents: NostrEvent[] = [];
    // eventId → Set of relay URLs that returned it
    const eventRelays = new Map<string, Set<string>>();
    const seenIds = new Set<string>();
    let eoseCount = 0;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      subs.forEach((s) => s.close());

      // Group by d-tag, keep latest per d-tag
      const grouped: Record<string, NostrEvent> = {};
      for (const event of documents) {
        let dTag: string | undefined;
        for (const tag of event.tags) {
          if (tag.length >= 2 && tag[0] === "d") { dTag = tag[1]; break; }
        }
        if (dTag && (!grouped[dTag] || event.created_at > grouped[dTag].created_at)) {
          grouped[dTag] = event;
        }
      }

      // Build address → relay[] map
      const relayMap = new Map<string, string[]>();
      for (const event of Object.values(grouped)) {
        const dTag = event.tags.find((t) => t[0] === "d")?.[1];
        if (!dTag) continue;
        const address = `${event.kind}:${event.pubkey}:${dTag}`;
        const relaysForEvent = eventRelays.get(event.id);
        relayMap.set(address, relaysForEvent ? Array.from(relaysForEvent) : []);
      }

      resolve({ relayMap });
    };

    const timeout = setTimeout(finish, 8000);

    // Subscribe to each relay individually so we can track origins
    const subs = relays.map((relay) =>
      pool.subscribeMany(
        [relay],
        { kinds: [KIND_FILE], authors: [pubkey] },
        {
          onevent: (event: NostrEvent) => {
            // Track which relay(s) returned this event
            if (!eventRelays.has(event.id)) eventRelays.set(event.id, new Set());
            eventRelays.get(event.id)!.add(relay);

            if (!seenIds.has(event.id)) {
              seenIds.add(event.id);
              documents.push(event);
              addDocument(event);
            }
          },
          oneose: () => {
            eoseCount++;
            if (eoseCount >= relays.length) finish();
          },
        },
      ),
    );
  });
}

export async function fetchDocumentByNaddr(
  relays: string[],
  naddr: string,
  onEvent: (event: Event) => void,
): Promise<Event | null> {
  const { kind, pubkey, identifier } = nip19.decode(naddr)
    .data as AddressPointer;
  return new Promise((resolve) => {
    let latestEvent: Event | null = null;

    const sub = pool.subscribeMany(
      relays,
      { kinds: [kind], "#d": [identifier], authors: [pubkey] },
      {
        onevent: (event: Event) => {
          // Track the latest event by created_at
          if (!latestEvent || event.created_at > latestEvent.created_at) {
            latestEvent = event;
          }
          onEvent(event);
        },
        oneose: () => {
          sub.close();
          resolve(latestEvent);
        },
      },
    );
  });
}

export const fetchEventsByKind = (
  relays: string[],
  kind: number,
  pubkey: string,
  onEvent: (event: Event) => void,
): Promise<Event | null> => {
  return new Promise((resolve) => {
    let latestEvent: Event | null = null;

    const sub = pool.subscribeMany(
      relays,
      { kinds: [kind], authors: [pubkey] },
      {
        onevent: (event: Event) => {
          if (!latestEvent || event.created_at > latestEvent.created_at) {
            latestEvent = event;
          }
          onEvent(event);
        },
        oneose: () => {
          sub.close();
          resolve(latestEvent);
        },
      },
    );
  });
};
