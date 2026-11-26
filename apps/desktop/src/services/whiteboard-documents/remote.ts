import type { BoardAgentActivity, BoardAgentPeers } from "../../../shared/whiteboard-agent";
import type { WhiteboardRemoteStatus } from "@/types/whiteboard-document";
import type { WhiteboardDocumentClient } from "./client";
import type { WhiteboardPeer, WhiteboardPresence } from "@tau/collaboration";

export interface WhiteboardRemoteBackend {
  agentPeers?(leaseId: string): Promise<BoardAgentPeers>;
  onAgentPeers?(listener: (event: BoardAgentPeers & { leaseId: string }) => void): () => void;
  agentActivity?(leaseId: string, activity: BoardAgentActivity | null): Promise<void>;
  open(leaseId: string, serverUrl: string): Promise<WhiteboardRemoteStatus>;
  refreshCheckpoint(leaseId: string): Promise<void>;
  sync(leaseId: string): Promise<WhiteboardRemoteStatus>;
  presence?(leaseId: string, value: WhiteboardPresence | null): Promise<void>;
  realtime?(
    listener: (event: { leaseId: string; connected: boolean; peers: WhiteboardPeer[] }) => void
  ): () => void;
}
/**
 * connecting/syncing/synced 为正常流转；offline 与 waiting 会自动重试；
 * 其余需要用户处理（重试、更新应用或转为本机白板），不会自动重投。
 */
export type WhiteboardRemotePhase =
  | "checking"
  | "local"
  | "connecting"
  | "syncing"
  | "synced"
  | "waiting"
  | "offline"
  | "forbidden"
  | "closed"
  | "incompatible"
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
      return { phase: "waiting" };
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
  private peers: readonly WhiteboardPeer[] = [];
  private peerListeners = new Set<() => void>();
  private connected = false;
  private localPresence?: { viewId: string; value: WhiteboardPresence };
  private combinedPeers: readonly WhiteboardPeer[] = [];
  private agents: readonly WhiteboardPeer[] = [];
  private notifyPeers() {
    this.combinedPeers = [...this.peers, ...this.agents];
    this.peerListeners.forEach(listener => listener());
  }
  reportAgent(activity: BoardAgentActivity | null) {
    const lease = this.client.leaseId;
    if (lease && !this.disposed)
      void this.backend
        .agentActivity?.(lease, activity)
        .catch(error => console.warn("白板 Agent 在线提示未送达", error));
  }
  getPeers = () => this.combinedPeers;
  subscribePeers = (listener: () => void) => {
    this.peerListeners.add(listener);
    return () => {
      this.peerListeners.delete(listener);
    };
  };
  publishPresence = (viewId: string, value: WhiteboardPresence | null) => {
    if (this.disposed || (!value && this.localPresence?.viewId !== viewId)) return;
    this.localPresence = value ? { viewId, value } : undefined;
    if (this.opened && this.client.leaseId)
      void this.backend.presence?.(this.client.leaseId, value).catch(() => undefined);
  };
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
    private readonly binding:
      | { serverUrl: string; documentId: string }
      | (() => Promise<{ serverUrl: string; documentId: string } | null>),
    private readonly backend: WhiteboardRemoteBackend,
    private readonly options = { pollMs: 10_000, debounceMs: 50, maxBackoffMs: 60_000 }
  ) {
    let sequence = -1;
    const receiveAgents = (snapshot: BoardAgentPeers) => {
      if (this.disposed || snapshot.sequence < sequence) return;
      sequence = snapshot.sequence;
      this.agents = snapshot.peers;
      this.notifyPeers();
    };
    if (backend.onAgentPeers && client.leaseId) {
      this.cleanup.push(
        backend.onAgentPeers(event => {
          if (event.leaseId === client.leaseId) receiveAgents(event);
        })
      );
      void backend
        .agentPeers?.(client.leaseId)
        .then(receiveAgents)
        .catch(error => console.warn("读取白板 Agent 在线提示失败", error));
    }
    if (backend.realtime)
      this.cleanup.push(
        backend.realtime(event => {
          if (this.disposed || event.leaseId !== this.client.leaseId) return;
          const restored = event.connected && !this.connected;
          const disconnected = !event.connected && this.connected;
          this.connected = event.connected;
          this.peers = event.peers;
          this.notifyPeers();
          if (restored) {
            if (this.localPresence)
              this.publishPresence(this.localPresence.viewId, this.localPresence.value);
            this.retry(false);
          }
          if (disconnected) this.retry(false);
        })
      );
    if (typeof binding === "function") this.state = { phase: "checking", unsynced: false };
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
      const reconnect = () => this.retry(false);
      for (const event of ["focus", "online"] as const) {
        window.addEventListener(event, reconnect);
        this.cleanup.push(() => window.removeEventListener(event, reconnect));
      }
    }
  }
  confirmationFor(revision: number) {
    if (this.state.phase === "local") return "local";
    if (this.confirmedRevision >= revision) return "confirmed";
    return this.state.phase === "offline" ? "offline" : "awaiting-confirmation";
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private set(patch: Partial<WhiteboardRemoteState>) {
    this.state = { ...this.state, ...patch };
    if (this.blocked() && this.peers.length) {
      this.peers = [];
      this.notifyPeers();
    }
    for (const listener of this.listeners) listener();
  }
  /** 需要用户处理的状态不自动重试，避免把被拒或旧代次材料反复发给服务端。 */
  private blocked() {
    return !["checking", "connecting", "syncing", "synced", ...AUTOMATIC].includes(
      this.state.phase
    );
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
    const started = performance.now();
    try {
      await this.client.ready;
      const leaseId = this.client.leaseId;
      if (this.disposed || !leaseId || this.client.needsReopen) return;
      if (!this.opened) {
        let binding;
        try {
          binding = typeof this.binding === "function" ? await this.binding() : this.binding;
        } catch {
          if (!this.disposed) {
            this.set({ phase: "waiting", message: "共享状态读取失败，正在重试", unsynced: true });
            this.schedule(this.backoff());
          }
          return;
        }
        if (this.disposed || this.client.needsReopen) return;
        if (!binding) {
          this.set({ phase: "local", unsynced: false, message: undefined });
          return;
        }
        this.set({ phase: "connecting", message: undefined });
        const opened = await this.backend.open(leaseId, binding.serverUrl);
        if (this.disposed) return;
        if (opened.requiresRebind) {
          if (opened.reason === "epoch") await this.backend.refreshCheckpoint(leaseId);
          else this.set({ phase: "rejected", unsynced: true });
          return;
        }
        this.opened = true;
        if (this.localPresence)
          this.publishPresence(this.localPresence.viewId, this.localPresence.value);
      }
      // 本机输入须先进入主进程日志，再计算发往房间的差异。
      await this.client.flush();
      if (this.disposed || this.client.needsReopen) return;
      if (this.state.unsynced && this.state.phase !== "connecting") this.set({ phase: "syncing" });
      const result = await this.backend.sync(leaseId);
      console.info("[whiteboard-sync] 同步轮次完成", {
        leaseId,
        elapsedMs: Math.round(performance.now() - started),
        pending: result.pending,
        localRevision: result.localRevision,
        pushConnected: this.connected,
      });
      if (this.disposed) return;
      if (result.requiresRebind) {
        if (result.reason === "epoch") await this.backend.refreshCheckpoint(leaseId);
        else this.set({ phase: "rejected", unsynced: true });
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
      console.warn("[whiteboard-sync] 同步轮次失败", {
        leaseId: this.client.leaseId,
        elapsedMs: Math.round(performance.now() - started),
        code: splitRemoteError(error).code ?? "UNKNOWN",
      });
      if (this.disposed) return;
      this.again = false;
      clearTimeout(this.timer);
      this.timer = undefined;
      this.scheduledAt = Infinity;
      if (this.client.getSnapshot().phase === "error") {
        // 重试时先读取房间代次，旧草稿阻塞保存时仍能接回新基线。
        this.opened = false;
        this.schedule(this.backoff());
        return;
      }
      const failure = classifyRemoteError(error);
      if (splitRemoteError(error).code === "EPOCH_CONFLICT") this.opened = false;
      this.set({ ...failure, unsynced: true });
      if (AUTOMATIC.has(failure.phase)) this.schedule(this.backoff());
    }
  }
  private pollDelay() {
    if (this.connected) return 60_000;
    return typeof document !== "undefined" && document.hidden
      ? this.options.pollMs * 3
      : this.options.pollMs;
  }
  private backoff() {
    this.failures++;
    const delay = Math.min(this.options.maxBackoffMs, 2_000 * 2 ** (this.failures - 1));
    console.info("[whiteboard-sync] 安排重试", { failures: this.failures, delayMs: delay });
    return delay;
  }
  dispose(): void {
    if (this.disposed) return;
    if (this.localPresence) this.publishPresence(this.localPresence.viewId, null);
    this.disposed = true;
    clearTimeout(this.timer);
    this.cleanup.splice(0).forEach(fn => fn());
    this.listeners.clear();
    this.peers = [];
    this.notifyPeers();
    this.agents = [];
    this.peerListeners.clear();
  }
}
