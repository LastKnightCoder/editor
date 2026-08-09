import { create } from "zustand";
import type {
  ChatRunRecord,
  ChatRunStatus,
  ChatSessionKey,
} from "@/types/chat-run";

interface ChatRunState {
  runs: Record<string, ChatRunRecord>;
  setRun: (run: ChatRunRecord) => void;
  removeRun: (runId: string) => void;
  setRuns: (runs: ChatRunRecord[]) => void;
  getForSession: (sessionKey: ChatSessionKey) => ChatRunRecord | null;
  setStatus: (
    runId: string,
    status: ChatRunStatus,
    errorMessage?: string | null,
  ) => void;
}

const useChatRunStore = create<ChatRunState>((set, get) => ({
  runs: {},
  setRun: (run) =>
    set((state) => ({ runs: { ...state.runs, [run.runId]: run } })),
  removeRun: (runId) =>
    set((state) => {
      const runs = { ...state.runs };
      delete runs[runId];
      return { runs };
    }),
  setRuns: (runs) =>
    set({ runs: Object.fromEntries(runs.map((run) => [run.runId, run])) }),
  getForSession: (sessionKey) => {
    const candidates = Object.values(get().runs).filter(
      (run) => run.sessionKey === sessionKey,
    );
    return candidates.sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
  },
  setStatus: (runId, status, errorMessage = null) =>
    set((state) => {
      const run = state.runs[runId];
      if (!run) return state;
      return {
        runs: {
          ...state.runs,
          [runId]: { ...run, status, errorMessage, updatedAt: Date.now() },
        },
      };
    }),
}));

export default useChatRunStore;
