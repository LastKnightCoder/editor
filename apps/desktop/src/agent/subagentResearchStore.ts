import type { SubAgentResearchPayload } from "./subagentResearch";

type Listener = () => void;

const sessions = new Map<string, SubAgentResearchPayload>();
const listeners = new Map<string, Set<Listener>>();

const emit = (sessionId: string) => {
  listeners.get(sessionId)?.forEach((listener) => listener());
};

export const subAgentResearchStore = {
  setSession(payload: SubAgentResearchPayload): void {
    sessions.set(payload.sessionId, payload);
    emit(payload.sessionId);
  },

  getSession(sessionId: string): SubAgentResearchPayload | undefined {
    return sessions.get(sessionId);
  },

  subscribe(sessionId: string, listener: Listener): () => void {
    const sessionListeners = listeners.get(sessionId) ?? new Set<Listener>();
    sessionListeners.add(listener);
    listeners.set(sessionId, sessionListeners);

    return () => {
      sessionListeners.delete(listener);
      if (sessionListeners.size === 0) {
        listeners.delete(sessionId);
      }
    };
  },

  clear(): void {
    sessions.clear();
    listeners.forEach((sessionListeners) => {
      sessionListeners.forEach((listener) => listener());
    });
    listeners.clear();
  },
};
