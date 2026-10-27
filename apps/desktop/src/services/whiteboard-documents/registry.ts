import { queryClient } from "@/queryClient";
import { WhiteboardDocumentClient } from "./client";
import { IndexedWhiteboardOutbox } from "./outbox";
import { WhiteboardRemoteSync } from "./remote";
import { whiteboardShareStatusKey } from "./keys";
import {
  readWhiteboardShareStatus,
  whiteboardDocumentBackend,
  whiteboardRemoteBackend,
} from "@/commands/whiteboard-document";
import type { WhiteboardDocumentTarget } from "@/types/whiteboard-document";
const outbox = new IndexedWhiteboardOutbox();
const entries = new Map<string, WhiteboardDocumentEntry>();
const remotes = new WeakMap<WhiteboardDocumentClient, WhiteboardRemoteSync>();

/** 共享状态控制器随客户端存活，确认绑定后才执行远端同步。 */
export function whiteboardRemoteSync(client: WhiteboardDocumentClient) {
  return remotes.get(client);
}
function disposeClient(client: WhiteboardDocumentClient) {
  remotes.get(client)?.dispose();
  remotes.delete(client);
  client.dispose();
}

export interface WhiteboardSessionState {
  phase: "idle" | "opening" | "ready" | "error";
  client?: WhiteboardDocumentClient;
  error?: unknown;
}

export class WhiteboardDocumentEntry {
  private state: WhiteboardSessionState = { phase: "idle" };
  private listeners = new Set<() => void>();
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private set(state: WhiteboardSessionState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  private holders = 0;
  private client?: WhiteboardDocumentClient;
  private opening?: Promise<WhiteboardDocumentClient>;
  private closing?: Promise<void>;
  constructor(
    readonly target: WhiteboardDocumentTarget,
    readonly documentId: string
  ) {}
  retain(): () => void {
    this.holders++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holders--;
      queueMicrotask(() => {
        void this.releaseIdle().catch(() => undefined);
      });
    };
  }
  open(): Promise<WhiteboardDocumentClient> {
    if (this.opening) return this.opening;
    // 先登记整段交接任务，再允许任何保存、释放或打开的异步操作执行。
    const task = Promise.resolve()
      .then(() => this.openOnce())
      .finally(() => {
        if (this.opening === task) this.opening = undefined;
        if (!this.holders) void this.releaseIdle().catch(() => undefined);
      });
    this.opening = task;
    return task;
  }
  private async openOnce(): Promise<WhiteboardDocumentClient> {
    if (this.closing) await this.closing.catch(() => undefined);
    const previous = this.client;
    if (previous && !previous.needsReopen && !previous.isDisposed) {
      this.attachRemote(previous);
      remotes.get(previous)?.retry(false);
      this.set({ phase: "ready", client: previous });
      return previous;
    }
    this.set({ phase: "opening", client: previous });
    let client: WhiteboardDocumentClient | undefined;
    try {
      if (previous) {
        remotes.get(previous)?.dispose();
        await previous.preservePending();
      }
      client = new WhiteboardDocumentClient(this.target, whiteboardDocumentBackend, outbox);
      await client.ready;
      if (client.identity?.documentId !== this.documentId) throw new Error("白板页已指向另一文档");
      this.client = client;
      const current = client;
      client.subscribe(() => {
        if (current !== this.client || !current.needsReopen) return;
        remotes.get(current)?.dispose();
        void queryClient.invalidateQueries({
          queryKey: whiteboardShareStatusKey(this.target.databaseName, this.documentId),
        });
        if (this.holders) void this.open().catch(() => undefined);
      });
      this.attachRemote(client);
      this.set({ phase: "ready", client });
      if (previous) disposeClient(previous);
      return client;
    } catch (error) {
      if (client) {
        disposeClient(client);
        if (client.leaseId)
          void whiteboardDocumentBackend.release(client.leaseId).catch(() => undefined);
      }
      this.set({ phase: "error", client: previous, error });
      throw error;
    }
  }
  /** 共享状态与画布的共享入口共用一份查询缓存；读取失败时仍可本机编辑。 */
  private attachRemote(client: WhiteboardDocumentClient): void {
    if (client.isDisposed || remotes.has(client)) return;
    const sync = new WhiteboardRemoteSync(
      client,
      async () => {
        const status = await queryClient.fetchQuery({
          queryKey: whiteboardShareStatusKey(this.target.databaseName, this.documentId),
          queryFn: () => readWhiteboardShareStatus(this.target.databaseName, this.documentId),
          staleTime: 0,
        });
        return status.binding;
      },
      whiteboardRemoteBackend
    );
    remotes.set(client, sync);
    sync.start();
  }
  private async releaseIdle(): Promise<void> {
    if (this.holders || this.opening || this.closing || !this.client) return;
    const client = this.client;
    const task = (async () => {
      if (!client.needsReopen && !client.isDisposed) {
        try {
          await client.flush();
        } catch (error) {
          if (!client.needsReopen) throw error;
        }
        if (this.holders) return;
      }
      // 远端同步随最后一个持有者停止；未提交的差异仍在主进程日志中，下次打开再同步。
      await client.release();
      disposeClient(client);
      if (this.client === client) {
        this.client = undefined;
        this.set({ phase: "idle" });
      }
    })();
    this.closing = task;
    try {
      await task;
    } finally {
      this.closing = undefined;
    }
  }
}
export function whiteboardDocumentEntry(
  target: WhiteboardDocumentTarget,
  documentId: string
): WhiteboardDocumentEntry {
  const key = JSON.stringify([target.databaseName, documentId]);
  let entry = entries.get(key);
  if (!entry) {
    entry = new WhiteboardDocumentEntry(target, documentId);
    entries.set(key, entry);
  }
  return entry;
}
