import type { WhiteboardRemoteStatus } from "@/types/whiteboard-document";
import type { WhiteboardDocumentClient } from "./client";

export interface WhiteboardRemoteBackend {
  open(leaseId: string, serverUrl: string): Promise<WhiteboardRemoteStatus>;
  sync(leaseId: string): Promise<WhiteboardRemoteStatus>;
}
/**
 * connecting/syncing/synced 为正常流转；offline 与 waiting 会自动重试；
 * 其余需要用户处理（重试、更新应用或采用新版本），不会自动重投。
 */
export type WhiteboardRemotePhase =
  | "connecting"
  | "syncing"
  | "synced"
  | "waiting"
  | "offline"
  | "forbidden"
  | "closed"
  | "incompatible"
  | "rebind"
  | "rejected"
  | "error";
export interface WhiteboardRemoteState {
  phase: WhiteboardRemotePhase;
  /** 本机仍有未经远端确认的修订。 */
  unsynced: boolean;
  message?: string;
}
const AUTOMATIC = new Set<WhiteboardRemotePhase>(["offline", "waiting"]);

const CODE_PREFIX = /^([A-Z][A-Z_]+): /;
/**
 * IPC 只保留错误文本，主进程以「代码: 原因」传递服务端错误码。
 * 没有代码前缀或前缀后没有原因时，message 保留完整原文。
 */
export function splitRemoteError(error: unknown): { code?: string; message: string } {
  const text = error instanceof Error ? error.message : String(error);
  const matched = CODE_PREFIX.exec(text);
  if (!matched) return { message: text };
  const reason = text.slice(matched[0].length).trim();
  return { code: matched[1], message: reason || text };
}

/** 共享、转换等一次性操作的失败文案：说明发生了什么、内容在哪、能做什么。 */
export function remoteFailureText(error: unknown): string {
  const { code, message } = splitRemoteError(error);
  switch (code) {
    case "OFFLINE":
      return "连不上协作服务，白板内容完好保存在本机。网络恢复后可以继续，或取消这次操作。";
    case "FORBIDDEN":
      return "协作服务拒绝了这次操作，白板内容完好保存在本机。";
    case "CLIENT_UPGRADE_REQUIRED":
      return "协作端需要更新版本的应用，白板内容完好保存在本机，请升级后再试。";
    case "DURABLE_DOCUMENT_UNSAVED":
      return `有窗口里的白板还没确认保存，这次操作没有开始，请稍后重试；反复出现时关闭这块白板再打开。（原因：${message}）`;
    case "DURABLE_DOCUMENT_FAILED":
      return `这块白板在本机保存出错，这次操作没有开始，已保存的内容不受影响。请关闭所有打开它的页面，重新打开后再试。（原因：${message}）`;
    default:
      return message;
  }
}

/** 按服务端代码归类；未知错误保留原因供用户判断。 */
export function classifyRemoteError(error: unknown): {
  phase: WhiteboardRemotePhase;
  message?: string;
} {
  const { code, message } = splitRemoteError(error);
  switch (code) {
    case "OFFLINE":
      return { phase: "offline" };
    case "FORBIDDEN":
      return { phase: "forbidden" };
    case "DOCUMENT_CLOSED":
      return { phase: "closed" };
    case "CLIENT_UPGRADE_REQUIRED":
      return { phase: "incompatible" };
    case "EPOCH_CONFLICT":
      return { phase: "rebind" };
    case "BRANCH_RETAINED":
      return { phase: "rejected" };
    case "MISSING_DEPENDENCIES":
    case "PENDING_OPERATION":
      return { phase: "waiting" };
    default:
      return { phase: "error", message };
  }
}

/**
 * 一个本机文档客户端对应一条远端同步：本机输入先经客户端耐久保存，再由主进程把差异提交到房间，
 * 远端确认经主进程日志投影回客户端（不是本机编辑，不进撤销历史）。客户端重开即换一条新同步。
 */
export class WhiteboardRemoteSync {
  private state: WhiteboardRemoteState = { phase: "connecting", unsynced: true };
  private listeners = new Set<() => void>();
  private opened = false;
  private running?: Promise<void>;
  private again = false;
  private timer?: ReturnType<typeof setTimeout>;
  private scheduledAt = Infinity;
  private failures = 0;
  private confirmedRevision = -1;
  private disposed = false;
  private cleanup: (() => void)[] = [];
  constructor(
    private readonly client: WhiteboardDocumentClient,
    readonly binding: { serverUrl: string; documentId: string },
    private readonly backend: WhiteboardRemoteBackend,
    private readonly options = { pollMs: 10_000, debounceMs: 800, maxBackoffMs: 60_000 }
  ) {
    this.cleanup.push(
      client.subscribe(() => {
        const local = client.getSnapshot();
        if (this.disposed || !this.opened || this.blocked()) return;
        if (local.revision > this.confirmedRevision) {
          if (!this.state.unsynced) this.set({ unsynced: true });
          if (!AUTOMATIC.has(this.state.phase)) this.schedule(this.options.debounceMs);
        }
      })
    );
    if (typeof window !== "undefined") {
      const focus = () => this.retry(false);
      window.addEventListener("focus", focus);
      this.cleanup.push(() => window.removeEventListener("focus", focus));
    }
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private set(patch: Partial<WhiteboardRemoteState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  /** 需要用户处理的状态不自动重试，避免把被拒或旧代次材料反复发给服务端。 */
  private blocked() {
    return !["connecting", "syncing", "synced", ...AUTOMATIC].includes(this.state.phase);
  }
  start(): void {
    this.schedule(0);
  }
  /** 用户点击重试或窗口回到前台：清掉退避，立即连接或同步。 */
  retry(force = true): void {
    if (this.disposed || (!force && this.blocked())) return;
    this.failures = 0;
    if (force && this.blocked()) this.set({ phase: this.opened ? "syncing" : "connecting" });
    this.schedule(0);
  }
  private schedule(delay: number): void {
    if (this.disposed) return;
    const due = performance.now() + delay;
    if (this.timer !== undefined && this.scheduledAt <= due) return;
    clearTimeout(this.timer);
    this.scheduledAt = due;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.scheduledAt = Infinity;
      if (this.running) {
        this.again = true;
        return;
      }
      this.running = this.run().finally(() => {
        this.running = undefined;
        if (this.again && !this.disposed) {
          this.again = false;
          this.schedule(0);
        }
      });
    }, delay);
  }
  private async run(): Promise<void> {
    try {
      await this.client.ready;
      const leaseId = this.client.leaseId;
      if (this.disposed || !leaseId || this.client.needsReopen) return;
      if (!this.opened) {
        this.set({ phase: "connecting" });
        const opened = await this.backend.open(leaseId, this.binding.serverUrl);
        if (this.disposed) return;
        if (opened.requiresRebind) {
          this.set({ phase: opened.reason === "rejected" ? "rejected" : "rebind", unsynced: true });
          return;
        }
        this.opened = true;
      }
      // 本机输入须先进入主进程日志，再计算发往房间的差异。
      await this.client.flush();
      if (this.state.unsynced && this.state.phase !== "connecting") this.set({ phase: "syncing" });
      const result = await this.backend.sync(leaseId);
      if (this.disposed) return;
      if (result.requiresRebind) {
        this.set({ phase: result.reason === "rejected" ? "rejected" : "rebind", unsynced: true });
        return;
      }
      this.failures = 0;
      this.confirmedRevision = result.localRevision ?? this.confirmedRevision;
      const unsynced =
        Boolean(result.requiresSync) ||
        result.pending > 0 ||
        this.client.getSnapshot().revision > this.confirmedRevision;
      this.set({ phase: unsynced ? "syncing" : "synced", unsynced, message: undefined });
      // 仍有未确认修订时本轮结束后立即再同步；否则按轮询间隔接收远端更新。
      if (unsynced) this.again = true;
      else this.schedule(this.pollDelay());
    } catch (error) {
      if (this.disposed) return;
      this.again = false;
      clearTimeout(this.timer);
      this.timer = undefined;
      this.scheduledAt = Infinity;
      if (this.client.getSnapshot().phase === "error") {
        // 本机保存失败由画布的保存状态提示；本机恢复后再继续同步。
        this.schedule(this.backoff());
        return;
      }
      const failure = classifyRemoteError(error);
      this.set({ ...failure, unsynced: true });
      if (AUTOMATIC.has(failure.phase)) this.schedule(this.backoff());
    }
  }
  private pollDelay() {
    return typeof document !== "undefined" && document.hidden
      ? this.options.pollMs * 3
      : this.options.pollMs;
  }
  private backoff() {
    this.failures++;
    return Math.min(this.options.maxBackoffMs, 2_000 * 2 ** (this.failures - 1));
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.timer);
    this.cleanup.splice(0).forEach(fn => fn());
    this.listeners.clear();
  }
}
