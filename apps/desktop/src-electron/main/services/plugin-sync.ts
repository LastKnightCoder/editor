import { randomUUID } from "node:crypto";
import path from "node:path";
import { app, webContents } from "electron";
import { readLocalPluginState } from "@tau/plugins/local-state";
import type { JsonValue, SyncProvider } from "@tau/plugins/sync";
import type { SyncRendererRequest, SyncRendererReply } from "../../../shared/sync-renderer";
import PathUtil from "../utils/PathUtil";
import { readPluginPackage } from "./plugin-package";

interface Session {
  pluginId: string;
  owner: number;
  ready: Promise<unknown>;
  pending: Set<Promise<unknown>>;
  closing?: Promise<void>;
}
type Send = (owner: number, request: SyncRendererRequest) => Promise<unknown>;

/** 主进程只登记任务并转发数据，不加载或求值插件。 */
export class PluginSyncSessions {
  private readonly sessions = new Map<string, Session>();
  private readonly changing = new Set<string>();
  constructor(
    private readonly validate: (id: string) => Promise<void>,
    private readonly send: Send
  ) {}
  get busy() {
    return this.sessions.size > 0;
  }
  async hasTasks() {
    return this.busy;
  }
  async begin(owner: number, pluginId: string, config: JsonValue) {
    if (this.changing.has(pluginId)) throw new Error("插件状态正在修改，请稍后重试");
    const id = randomUUID();
    const session: Session = {
      owner,
      pluginId,
      pending: new Set(),
      ready: Promise.resolve().then(async () => {
        await this.validate(pluginId);
        if (!this.sessions.has(id)) throw new Error("同步窗口已关闭");
        return this.send(owner, { kind: "open", session: id, pluginId, config });
      }),
    };
    this.sessions.set(id, session);
    try {
      await session.ready;
      return id;
    } catch (error) {
      this.sessions.delete(id);
      throw error;
    }
  }
  async call(owner: number, id: string, method: keyof SyncProvider, args: unknown[]) {
    const session = this.sessions.get(id);
    if (!session || session.closing) throw new DOMException("同步任务已结束", "AbortError");
    if (session.owner !== owner) throw new Error("同步任务不属于当前窗口");
    const operation = session.ready.then(() =>
      this.send(owner, { kind: "call", session: id, method, args })
    );
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
      try {
        await session.ready;
        await Promise.allSettled([...session.pending]);
        if (this.sessions.has(id)) await this.send(owner, { kind: "close", session: id });
      } finally {
        this.sessions.delete(id);
      }
    })();
    return session.closing;
  }
  releaseOwner(owner: number) {
    for (const [id, session] of this.sessions)
      if (session.owner === owner) this.sessions.delete(id);
  }
  async protect<T>(pluginId: string, action: () => Promise<T>): Promise<T> {
    if (
      this.changing.has(pluginId) ||
      [...this.sessions.values()].some(session => session.pluginId === pluginId)
    )
      throw new Error("插件有正在进行的同步任务，请结束后再修改");
    this.changing.add(pluginId);
    try {
      return await action();
    } finally {
      this.changing.delete(pluginId);
    }
  }
}

const pending = new Map<
  string,
  { owner: number; resolve(value: unknown): void; reject(error: Error): void }
>();
const owners = new WeakSet<object>();
export function releaseSyncRenderer(owner: number) {
  for (const [id, request] of pending)
    if (request.owner === owner) {
      pending.delete(id);
      request.reject(new DOMException("同步渲染进程已断开", "AbortError"));
    }
  pluginSyncSessions.releaseOwner(owner);
}
export function acceptSyncRendererReply(owner: number, reply: SyncRendererReply) {
  const request = pending.get(reply.requestId);
  if (!request || request.owner !== owner) return;
  pending.delete(reply.requestId);
  if (reply.error !== undefined) {
    const error = new Error(reply.error);
    error.name = reply.errorName ?? "Error";
    request.reject(error);
  } else request.resolve(reply.result);
}
function sendToRenderer(owner: number, request: SyncRendererRequest): Promise<unknown> {
  const target = webContents.fromId(owner);
  if (!target || target.isDestroyed()) return Promise.reject(new Error("同步窗口已关闭"));
  if (!owners.has(target)) {
    owners.add(target);
    const release = () => releaseSyncRenderer(owner);
    target.once("destroyed", release);
    target.on("did-navigate", release);
    target.on("render-process-gone", release);
  }
  const requestId = randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(requestId, { owner, resolve, reject });
    try {
      target.send("plugin-sync:request", { ...request, requestId });
    } catch (error) {
      pending.delete(requestId);
      reject(error);
    }
  });
}
export const pluginSyncSessions = new PluginSyncSessions(async pluginId => {
  const directory = path.join(PathUtil.getAppDir(), "plugins");
  const artifact = await readPluginPackage(path.join(directory, pluginId), app.getVersion());
  if (artifact.manifest.id !== pluginId) throw new Error("插件身份无效");
  if (!(await readLocalPluginState(directory)).enabled[pluginId])
    throw new Error("同步插件尚未启用");
}, sendToRenderer);
