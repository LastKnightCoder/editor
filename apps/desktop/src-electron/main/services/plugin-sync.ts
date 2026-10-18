import { randomUUID } from "node:crypto";
import path from "node:path";
import { app } from "electron";
import { openSyncPlugin } from "@tau/plugins/sync-host";
import type { SyncProvider } from "@tau/plugins/sync";
import type { JsonValue } from "@tau/plugins";
import PathUtil from "../utils/PathUtil";
import {
  acquirePluginSyncLease,
  withPluginSyncMutation,
  hasPluginSyncLeases,
} from "@tau/plugins/sync-leases";

interface Session {
  pluginId: string;
  owner: number;
  provider: Promise<SyncProvider>;
  pending: Set<Promise<unknown>>;
  closing?: Promise<void>;
  release?: () => Promise<void>;
}
export class PluginSyncSessions {
  private readonly sessions = new Map<string, Session>();
  private readonly changing = new Set<string>();
  constructor(
    private readonly load: (id: string, config: JsonValue) => Promise<SyncProvider>,
    private readonly directory?: () => string
  ) {}
  async hasTasks() {
    return this.busy || (!!this.directory && (await hasPluginSyncLeases(this.directory())));
  }
  get busy() {
    return this.sessions.size > 0;
  }
  async begin(owner: number, pluginId: string, config: JsonValue) {
    if (this.changing.has(pluginId)) throw new Error("插件状态正在修改，请稍后重试");
    const id = randomUUID();
    const session: Session = {
      owner,
      pluginId,
      provider: Promise.resolve().then(async () => {
        if (this.directory)
          session.release = await acquirePluginSyncLease(this.directory(), pluginId);
        return this.load(pluginId, config);
      }),
      pending: new Set(),
    };
    this.sessions.set(id, session);
    try {
      await session.provider;
      return id;
    } catch (error) {
      await session.release?.();
      this.sessions.delete(id);
      throw error;
    }
  }
  async call(owner: number, id: string, method: keyof SyncProvider, args: unknown[]) {
    const session = this.sessions.get(id);
    if (!session || session.owner !== owner || session.closing)
      throw new Error("同步任务已结束或不属于当前窗口");
    const operation = (async () => {
      const provider = await session.provider;
      if (!Array.isArray(args)) throw new Error("同步参数无效");
      const key = args[0];
      if (method === "listFiles") {
        if (key !== undefined && typeof key !== "string") throw new Error("文件前缀无效");
        return provider.listFiles(key as string | undefined);
      }
      if (typeof key !== "string") throw new Error("文件名无效");
      if (method === "downloadFile") return provider.downloadFile(key);
      if (method === "fileExists") return provider.fileExists(key);
      if (
        (method === "uploadFile" || method === "createFileIfAbsent") &&
        args[1] instanceof Uint8Array
      )
        return provider[method](key, args[1]);
      throw new Error("同步操作或参数无效");
    })();
    session.pending.add(operation);
    try {
      return await operation;
    } finally {
      session.pending.delete(operation);
    }
  }
  async end(owner: number, id: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.owner !== owner) throw new Error("同步任务不属于当前窗口");
    session.closing ??= (async () => {
      await session.provider.catch(() => undefined);
      await Promise.allSettled([...session.pending]);
      await session.release?.();
      this.sessions.delete(id);
    })();
    return session.closing;
  }
  async releaseOwner(owner: number) {
    await Promise.allSettled(
      [...this.sessions]
        .filter(([, session]) => session.owner === owner)
        .map(([id]) => this.end(owner, id))
    );
  }
  async protect<T>(pluginId: string, action: () => Promise<T>): Promise<T> {
    if (
      this.changing.has(pluginId) ||
      [...this.sessions.values()].some(session => session.pluginId === pluginId)
    )
      throw new Error("插件有正在进行的同步任务，请结束后再修改");
    this.changing.add(pluginId);
    try {
      return await (this.directory
        ? withPluginSyncMutation(this.directory(), pluginId, action)
        : action());
    } finally {
      this.changing.delete(pluginId);
    }
  }
}
export const pluginSyncSessions = new PluginSyncSessions(
  (pluginId, config) =>
    openSyncPlugin({
      directory: path.join(PathUtil.getAppDir(), "plugins"),
      pluginId,
      config,
      clientVersion: app.getVersion(),
    }),
  () => path.join(PathUtil.getAppDir(), "plugins")
);
