/**
 * pi 会话渲染端 store：sessionId → 视图模型（PiSessionVM）。
 * 事件经 onPiSessionEvent 灌入归约器；每次事件后换新引用触发订阅更新
 * （流式高频下浅克隆 transcript，量级小可接受，后续按需节流）。
 */
import { create } from "zustand";
import {
  onPiSessionEvent,
  piSessionAbort,
  piSessionCreate,
  piSessionDispose,
  piSessionPrompt,
  piSessionSteer,
  type PiSessionCreateOptions,
} from "@/commands/piSession";
import { createPiSessionReducer, type PiSessionVM } from "@/services/piSessionModel";

interface SessionEntry {
  vm: PiSessionVM;
  reducer: ReturnType<typeof createPiSessionReducer>;
  unsubscribe: () => void;
}

interface PiSessionState {
  sessions: Record<string, PiSessionVM>;
  errors: Record<string, string | undefined>;
  ensureSession: (sessionId: string, options: PiSessionCreateOptions) => Promise<void>;
  sendText: (sessionId: string, text: string) => Promise<void>;
  steerText: (sessionId: string, text: string) => Promise<void>;
  abortSession: (sessionId: string) => Promise<void>;
  closeSession: (sessionId: string) => Promise<void>;
}

const entries = new Map<string, SessionEntry>();

const publish = (sessionId: string, mutate: (entry: SessionEntry) => void) => {
  const entry = entries.get(sessionId);
  if (!entry) return;
  mutate(entry);
  // 换引用触发订阅；transcript/executions 换新数组保证列表渲染 diff
  const snapshot: PiSessionVM = {
    ...entry.vm,
    transcript: [...entry.vm.transcript],
    executions: [...entry.vm.executions],
  };
  usePiSessionStore.setState(state => ({ sessions: { ...state.sessions, [sessionId]: snapshot } }));
};

export const usePiSessionStore = create<PiSessionState>(set => ({
  sessions: {},
  errors: {},
  ensureSession: async (sessionId, options) => {
    if (entries.has(sessionId)) return;
    const reducer = createPiSessionReducer();
    const entry: SessionEntry = { vm: reducer.state, reducer, unsubscribe: () => undefined };
    entries.set(sessionId, entry);
    publish(sessionId, () => undefined);

    const outcome = await piSessionCreate(sessionId, options);
    if (!outcome.ok) {
      set(state => ({ errors: { ...state.errors, [sessionId]: outcome.error } }));
      entries.delete(sessionId);
      return;
    }
    entry.unsubscribe = onPiSessionEvent(sessionId, event =>
      publish(sessionId, e => e.reducer.process(event))
    );
  },
  sendText: async (sessionId, text) => {
    publish(sessionId, e => e.reducer.appendUserMessage(text));
    const outcome = await piSessionPrompt(sessionId, text);
    if (!outcome.ok) set(state => ({ errors: { ...state.errors, [sessionId]: outcome.error } }));
  },
  steerText: async (sessionId, text) => {
    const outcome = await piSessionSteer(sessionId, text);
    if (outcome.ok) return;
    const error =
      outcome.error ?? (outcome.reason === "not-streaming" ? "会话已空闲，无法插话" : "插话失败");
    set(state => ({ errors: { ...state.errors, [sessionId]: error } }));
  },
  abortSession: async sessionId => {
    await piSessionAbort(sessionId);
  },
  closeSession: async sessionId => {
    entries.get(sessionId)?.unsubscribe();
    entries.delete(sessionId);
    await piSessionDispose(sessionId);
    set(state => {
      const sessions = { ...state.sessions };
      const errors = { ...state.errors };
      delete sessions[sessionId];
      delete errors[sessionId];
      return { sessions, errors };
    });
  },
}));
