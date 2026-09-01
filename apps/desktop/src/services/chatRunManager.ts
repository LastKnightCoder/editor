import {
  createChatRun,
  deleteChatRun,
  deleteChatRunsForSession,
  finalizeChatRun,
  getActiveChatRuns,
  updateChatRun,
} from "@/commands/chat-run";
import type {
  ChatRunRecord,
  ChatRunStatus,
  ChatSessionKey,
} from "@/types/chat-run";
import useChatRunStore from "@/stores/useChatRunStore";

type RunListener = (run: ChatRunRecord) => void;
type RuntimeController = AbortController;
type ChatRunStartInput = Omit<
  ChatRunRecord,
  "runId" | "createdAt" | "updatedAt"
> & {
  runId?: string;
};

const ACTIVE_STATUSES: ChatRunStatus[] = [
  "queued",
  "running",
  "retrying",
  "waiting_input",
];

const TERMINAL_STATUSES: ChatRunStatus[] = ["completed", "failed", "cancelled"];
const INTERRUPTED_ON_HYDRATE_STATUSES: ChatRunStatus[] = [
  "queued",
  "running",
  "retrying",
];

const createSessionDiscardedError = () => {
  const error = new Error("会话已删除，聊天任务已取消");
  error.name = "AbortError";
  return error;
};

export class ChatRunManager {
  private controllers = new Map<string, RuntimeController>();
  private listeners = new Map<ChatSessionKey, Set<RunListener>>();
  private persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private persistChains = new Map<string, Promise<void>>();
  private sessionVersions = new Map<ChatSessionKey, number>();
  private hydrationVersion = 0;

  async hydrate() {
    const hydrationVersion = ++this.hydrationVersion;
    this.controllers.forEach((controller) => controller.abort());
    this.controllers.clear();
    this.persistTimers.forEach((timer) => clearTimeout(timer));
    this.persistTimers.clear();
    try {
      const records = await getActiveChatRuns();
      if (hydrationVersion !== this.hydrationVersion) return;
      const recovered = records.map((record) =>
        INTERRUPTED_ON_HYDRATE_STATUSES.includes(record.status)
          ? { ...record, status: "interrupted" as const }
          : record,
      );
      useChatRunStore.getState().setRuns(recovered);
      for (const record of recovered) {
        if (record.status === "interrupted") {
          await this.persist(record);
        }
      }
    } catch (error) {
      console.warn("加载聊天后台任务失败:", error);
    }
  }

  async resume(runId: string) {
    const run = useChatRunStore.getState().runs[runId];
    if (!run || !["interrupted", "failed"].includes(run.status)) return null;
    this.update(
      runId,
      { status: "retrying", attempt: run.attempt + 1, errorMessage: null },
      true,
    );
    return useChatRunStore.getState().runs[runId] || null;
  }

  async start(input: ChatRunStartInput): Promise<ChatRunRecord> {
    if (input.runId) {
      const existing = useChatRunStore.getState().runs[input.runId];
      if (existing && existing.sessionKey === input.sessionKey) {
        const { runId: _runId, ...patch } = input;
        this.update(existing.runId, { ...patch, status: "running" }, true);
        return useChatRunStore.getState().runs[existing.runId];
      }
    }
    const active = useChatRunStore.getState().getForSession(input.sessionKey);
    if (active && ACTIVE_STATUSES.includes(active.status)) {
      throw new Error("当前会话已有正在运行的任务");
    }
    const sessionVersion = this.sessionVersions.get(input.sessionKey) ?? 0;
    const { runId: requestedRunId, ...recordInput } = input;
    const record = await createChatRun({
      ...recordInput,
      runId:
        requestedRunId ??
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    });
    if ((this.sessionVersions.get(input.sessionKey) ?? 0) !== sessionVersion) {
      try {
        await deleteChatRun(record.runId);
      } catch (error) {
        console.warn("清理已删除会话的迟到聊天任务失败:", error);
      }
      throw createSessionDiscardedError();
    }
    useChatRunStore.getState().setRun(record);
    this.emit(record);
    return record;
  }

  attachController(runId: string, controller: RuntimeController) {
    const run = useChatRunStore.getState().runs[runId];
    if (!run || !ACTIVE_STATUSES.includes(run.status)) {
      controller.abort();
      return;
    }
    this.controllers.set(runId, controller);
  }

  hasController(runId: string) {
    return this.controllers.has(runId);
  }

  update(runId: string, patch: Partial<ChatRunRecord>, immediate = false) {
    const current = useChatRunStore.getState().runs[runId];
    if (!current) return;
    if (
      TERMINAL_STATUSES.includes(current.status) &&
      (!patch.status || patch.status !== current.status)
    ) {
      return;
    }
    const next = { ...current, ...patch, updatedAt: Date.now() };
    useChatRunStore.getState().setRun(next);
    this.emit(next);
    if (immediate) {
      void this.persist(next);
      return;
    }
    if (!this.persistTimers.has(runId)) {
      const timer = setTimeout(() => {
        this.persistTimers.delete(runId);
        const latest = useChatRunStore.getState().runs[runId];
        if (latest) void this.persist(latest);
      }, 250);
      this.persistTimers.set(runId, timer);
    }
  }

  finish(
    runId: string,
    status: Extract<ChatRunStatus, "completed" | "failed" | "cancelled">,
    errorMessage?: string | null,
  ) {
    this.update(runId, { status, errorMessage: errorMessage ?? null }, true);
    this.controllers.delete(runId);
  }

  finalizePersisted(
    runId: string,
    status: Extract<ChatRunStatus, "completed" | "cancelled">,
    errorMessage?: string | null,
  ) {
    const current = useChatRunStore.getState().runs[runId];
    if (!current) return;
    const next = {
      ...current,
      status,
      errorMessage: errorMessage ?? null,
      updatedAt: Date.now(),
    };
    const timer = this.persistTimers.get(runId);
    if (timer) clearTimeout(timer);
    this.persistTimers.delete(runId);
    useChatRunStore.getState().setRun(next);
    this.emit(next);
    this.controllers.delete(runId);

    const previous = this.persistChains.get(runId) || Promise.resolve();
    const finalize = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          await updateChatRun(next);
        } catch {
          // 压缩命令仍会尝试原子写入终态，避免恢复已经完成的请求。
        }
        try {
          await finalizeChatRun(runId, status, errorMessage ?? null);
        } catch {
          // 终态压缩失败不会影响已持久化的会话，下次维护时会再次清理。
        }
      });
    this.persistChains.set(runId, finalize);
    void finalize;
  }

  cancel(sessionKey: ChatSessionKey) {
    const run = useChatRunStore.getState().getForSession(sessionKey);
    if (!run) return;
    this.controllers.get(run.runId)?.abort();
    this.finish(run.runId, "cancelled");
  }

  async discardSession(sessionKey: ChatSessionKey) {
    this.sessionVersions.set(
      sessionKey,
      (this.sessionVersions.get(sessionKey) ?? 0) + 1,
    );
    this.cancel(sessionKey);
    const runs = Object.values(useChatRunStore.getState().runs).filter(
      (run) => run.sessionKey === sessionKey,
    );
    runs.forEach((run) => {
      const timer = this.persistTimers.get(run.runId);
      if (timer) clearTimeout(timer);
      this.persistTimers.delete(run.runId);
      this.controllers.delete(run.runId);
      useChatRunStore.getState().removeRun(run.runId);
    });
    try {
      await deleteChatRunsForSession(sessionKey);
    } catch {
      // 删除会话后任务不再应影响 UI；数据库重新可用时不会恢复已移除的内存任务。
    }
  }

  subscribe(sessionKey: ChatSessionKey, listener: RunListener) {
    const listeners = this.listeners.get(sessionKey) || new Set<RunListener>();
    listeners.add(listener);
    this.listeners.set(sessionKey, listeners);
    const current = useChatRunStore.getState().getForSession(sessionKey);
    if (current) listener(current);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(sessionKey);
    };
  }

  getSnapshot(sessionKey: ChatSessionKey) {
    return useChatRunStore.getState().getForSession(sessionKey);
  }

  private async persist(record: ChatRunRecord) {
    const previous = this.persistChains.get(record.runId) || Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          await updateChatRun(record);
        } catch {
          // 数据库切换或关闭期间，内存快照仍然保留，下一次启动会再次尝试恢复。
        }
      });
    this.persistChains.set(record.runId, next);
    await next;
  }

  private emit(record: ChatRunRecord) {
    this.listeners
      .get(record.sessionKey)
      ?.forEach((listener) => listener(record));
  }
}

export const chatRunManager = new ChatRunManager();
