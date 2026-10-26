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

export class WhiteboardDocumentEntry {
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
  async open(): Promise<WhiteboardDocumentClient> {
    if (this.closing) await this.closing.catch(() => undefined);
    if (this.client?.needsReopen) {
      await this.client.preservePending();
      disposeClient(this.client);
      this.client = undefined;
    }
    if (this.client && !this.client.isDisposed) {
      this.attachRemote(this.client);
      remotes.get(this.client)?.retry(false);
      return this.client;
    }
    if (this.opening) return this.opening;
    const client = new WhiteboardDocumentClient(this.target, whiteboardDocumentBackend, outbox);
    const task = client.ready.then(async () => {
      if (client.identity?.documentId !== this.documentId) throw new Error("白板页已指向另一文档");
      this.client = client;
      client.subscribe(() => {
        if (client.needsReopen) {
          void queryClient.invalidateQueries({
            queryKey: ["whiteboard-document", this.target.databaseName, this.documentId],
          });
          void queryClient.invalidateQueries({
            queryKey: whiteboardShareStatusKey(this.target.databaseName, this.documentId),
          });
        }
      });
      this.attachRemote(client);
      return client;
    });
    this.opening = task;
    try {
      return await task;
    } catch (error) {
      disposeClient(client);
      if (client.leaseId)
        void whiteboardDocumentBackend.release(client.leaseId).catch(() => undefined);
      throw error;
    } finally {
      this.opening = undefined;
      if (!this.holders)
        queueMicrotask(() => {
          void this.releaseIdle().catch(() => undefined);
        });
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
    if (this.holders || this.closing || !this.client) return;
    const client = this.client;
    const task = (async () => {
      if (!client.needsReopen && !client.isDisposed) {
        try {
          await client.flush();
        } catch (error) {
          if (!client.needsReopen) throw error;
        }
        if (this.holders && !client.needsReopen) return;
      }
      // 远端同步随最后一个持有者停止；未提交的差异仍在主进程日志中，下次打开再同步。
      await client.release();
      disposeClient(client);
      if (this.client === client) this.client = undefined;
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
