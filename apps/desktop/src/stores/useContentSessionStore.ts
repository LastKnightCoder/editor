import { create } from "zustand";
import { openCollaborationContentSession } from "@/commands";
import { on } from "@/electron";
import type {
  ContentSessionSnapshot,
  ContentSessionTarget,
  SourceBinding,
} from "@tau/collaboration";

export const contentSessionKey = (databaseName: string, contentId: number) =>
  `${databaseName}:${contentId}`;
const useContentSessionStore = create<{
  entries: Record<string, ContentSessionSnapshot>;
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
              [key]: snapshot,
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

export default useContentSessionStore;
