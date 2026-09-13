import { create } from "zustand";
import { openCollaborationContentSession } from "@/commands";
import { on } from "@/electron";
import type {
  ContentSessionSnapshot,
  ContentSessionTarget,
  SharedContent,
  SourceBinding,
} from "@tau/collaboration";

export interface ContentSessionEntry extends ContentSessionSnapshot {
  value?: SharedContent;
}

/** 键序无关的稳定序列化：投影产物是 plain object，普通 JSON.stringify 的键序
 *  在不同来源的副本间不保证一致，直接对比会漏更新 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        key =>
          `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`
      );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export const contentSessionKey = (databaseName: string, contentId: number) =>
  `${databaseName}:${contentId}`;
const useContentSessionStore = create<{
  entries: Record<string, ContentSessionEntry>;
  revision: number;
}>(() => ({ entries: {}, revision: 0 }));
const pending = new Map<string, Promise<ContentSessionSnapshot>>();
let initialized = false;
let bindingSignature = "";

export function initializeContentSessions() {
  if (initialized) return;
  initialized = true;
  on(
    "collaboration:state",
    (_event, state: { sessions: { id: string; status: string; source?: SourceBinding }[] }) => {
      const signature = JSON.stringify(
        state.sessions.map(session => [session.id, session.status, session.source])
      );
      if (bindingSignature === signature) return;
      bindingSignature = signature;
      useContentSessionStore.setState(current => ({ revision: current.revision + 1 }));
    }
  );
  on("collaboration:removed", (_event, { documentId }: { documentId: string }) => {
    useContentSessionStore.setState(state => ({
      entries: Object.fromEntries(
        Object.entries(state.entries).filter(([, entry]) => entry.documentId !== documentId)
      ),
      revision: state.revision + 1,
    }));
  });
  on(
    "collaboration:content",
    (_event, payload: { documentId: string; source?: SourceBinding; title: string }) => {
      if (!payload.source) return;
      const key = contentSessionKey(payload.source.databaseName, payload.source.contentId);
      const entry = useContentSessionStore.getState().entries[key];
      if (entry?.documentId === payload.documentId && entry.title !== payload.title)
        useContentSessionStore.setState(state => ({
          entries: { ...state.entries, [key]: { ...entry, title: payload.title } },
        }));
    }
  );
}

export async function openContentSession(databaseName: string, target: ContentSessionTarget) {
  initializeContentSessions();
  const key = contentSessionKey(databaseName, target.contentId);
  let request = pending.get(key);
  if (!request) {
    request = openCollaborationContentSession(target)
      .then(snapshot => snapshot as ContentSessionSnapshot)
      .then(snapshot => {
        useContentSessionStore.setState(state => {
          const previous = state.entries[key];
          if (
            previous?.documentId === snapshot.documentId &&
            previous.title === snapshot.title &&
            previous.frozen === snapshot.frozen
          )
            return state;
          return {
            entries: {
              ...state.entries,
              [key]: {
                ...snapshot,
                value: previous?.documentId === snapshot.documentId ? previous.value : undefined,
              },
            },
          };
        });
        return snapshot;
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
  }
  return request;
}

export function publishSessionValue(documentId: string, value: SharedContent) {
  useContentSessionStore.setState(state => {
    let changed = false;
    const entries = { ...state.entries };
    for (const [key, entry] of Object.entries(entries)) {
      if (
        entry.documentId !== documentId ||
        stableStringify(entry.value) === stableStringify(value)
      )
        continue;
      entries[key] = { ...entry, value, title: value.title };
      changed = true;
    }
    return changed ? { entries } : state;
  });
}

export default useContentSessionStore;
