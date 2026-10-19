import { randomUUID } from "node:crypto";
import path from "node:path";
import { app, webContents } from "electron";
import { readLocalPluginState } from "@tau/plugins/local-state";
import type { JsonValue, PublishTarget } from "@tau/plugins";
import type {
  PublishRendererRequest,
  PublishRendererReply,
} from "../../../shared/publish-renderer";
import PathUtil from "../utils/PathUtil";
import { readPluginPackage } from "./plugin-package";

interface Session {
  owner: number;
  pluginId: string;
  config: JsonValue;
  controller: AbortController;
}
export function safePublishError(error: unknown, config: unknown): Error {
  let message = error instanceof Error ? error.message : String(error);
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (
        /(token|secret|password|accessKey|apiKey|authorization|cookie)/i.test(key) &&
        typeof item === "string" &&
        item
      )
        message = message.replaceAll(item, "[已隐藏]");
      else if (item && typeof item === "object") walk(item);
    }
  };
  walk(config);
  return new Error(message.replace(/https:\/\/[^/\s]+@/gi, "https://[已隐藏]@"));
}

export class PluginPublishSessions {
  private readonly sessions = new Map<string, Session>();
  private readonly changing = new Set<string>();
  constructor(
    private readonly validate: (id: string) => Promise<void>,
    private readonly send: (owner: number, request: PublishRendererRequest) => Promise<unknown>
  ) {}
  get busy() {
    return this.sessions.size > 0;
  }
  async begin(owner: number, pluginId: string, config: JsonValue) {
    if (this.changing.has(pluginId)) throw new Error("插件状态正在修改");
    const id = randomUUID();
    const session: Session = {
      owner,
      pluginId,
      config: structuredClone(config),
      controller: new AbortController(),
    };
    this.sessions.set(id, session);
    try {
      await this.validate(pluginId);
      session.controller.signal.throwIfAborted();
      const info = (await this.send(owner, {
        kind: "open",
        session: id,
        pluginId,
        config: session.config,
      })) as { mode?: string; concurrency?: number };
      session.controller.signal.throwIfAborted();
      if (
        !["files", "snapshot"].includes(info?.mode ?? "") ||
        !Number.isInteger(info.concurrency) ||
        info.concurrency! < 1 ||
        info.concurrency! > 32
      )
        throw new Error("发布提供方信息无效");
      return {
        id,
        mode: info.mode as "files" | "snapshot",
        concurrency: info.concurrency!,
        signal: session.controller.signal,
      };
    } catch (error) {
      await this.end(owner, id);
      throw safePublishError(error, config);
    }
  }
  async call<T>(
    owner: number,
    id: string,
    method: Extract<PublishRendererRequest, { kind: "call" }>["method"],
    args: unknown[] = []
  ): Promise<T> {
    const session = this.sessions.get(id);
    if (!session || session.owner !== owner) throw new Error("发布会话已结束或不属于当前窗口");
    session.controller.signal.throwIfAborted();
    try {
      const result = await this.send(owner, { kind: "call", session: id, method, args });
      session.controller.signal.throwIfAborted();
      return result as T;
    } catch (error) {
      throw safePublishError(error, session.config);
    }
  }
  async describe(owner: number, id: string): Promise<PublishTarget> {
    const target = await this.call<PublishTarget>(owner, id, "describe");
    if (
      !target ||
      typeof target.identity !== "string" ||
      !target.identity ||
      target.identity.length > 4096 ||
      typeof target.basePath !== "string" ||
      !/^\/(?:[^?#\\]*\/)?$/.test(target.basePath) ||
      target.basePath.split("/").some(segment => segment === "." || segment === "..")
    )
      throw new Error("发布目标无效");
    if (target.publicUrl && !/^https?:\/\//.test(target.publicUrl))
      throw new Error("发布公开地址无效");
    return { identity: target.identity, basePath: target.basePath, publicUrl: target.publicUrl };
  }
  async end(owner: number, id: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.owner !== owner) throw new Error("发布会话不属于当前窗口");
    session.controller.abort();
    try {
      await this.send(owner, { kind: "close", session: id });
    } catch {
      /* 窗口已关闭时由主进程回收占用。 */
    } finally {
      this.sessions.delete(id);
    }
  }
  releaseOwner(owner: number) {
    for (const [id, session] of this.sessions)
      if (session.owner === owner) {
        session.controller.abort();
        this.sessions.delete(id);
      }
  }
  async protect<T>(pluginId: string, action: () => Promise<T>): Promise<T> {
    if (
      this.changing.has(pluginId) ||
      [...this.sessions.values()].some(session => session.pluginId === pluginId)
    )
      throw new Error("插件有正在进行的发布任务，请结束后再修改");
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
  {
    owner: number;
    resolve(value: unknown): void;
    reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const owners = new WeakSet<object>();
export function releasePublishRenderer(owner: number) {
  pluginPublishSessions.releaseOwner(owner);
  for (const [id, request] of pending)
    if (request.owner === owner) {
      clearTimeout(request.timer);
      pending.delete(id);
      request.reject(new Error("发布窗口已断开"));
    }
}
export function acceptPublishRendererReply(owner: number, reply: PublishRendererReply) {
  const request = pending.get(reply?.requestId);
  if (!request || request.owner !== owner) return;
  pending.delete(reply.requestId);
  clearTimeout(request.timer);
  if (typeof reply.error === "string") request.reject(new Error(reply.error));
  else request.resolve(reply.result);
}
function send(owner: number, request: PublishRendererRequest): Promise<unknown> {
  const target = webContents.fromId(owner);
  if (!target || target.isDestroyed()) return Promise.reject(new Error("发布窗口已关闭"));
  if (!owners.has(target)) {
    owners.add(target);
    const release = () => releasePublishRenderer(owner);
    target.once("destroyed", release);
    target.on("did-navigate", release);
    target.on("render-process-gone", release);
  }
  return new Promise((resolve, reject) => {
    const requestId = randomUUID();
    const timer = setTimeout(
      () => {
        pending.delete(requestId);
        reject(new Error("发布插件响应超时"));
      },
      request.kind === "close"
        ? 5_000
        : request.kind === "call" && request.method === "publish"
          ? 600_000
          : 120_000
    );
    pending.set(requestId, { owner, resolve, reject, timer });
    try {
      target.send("plugin-publish:request", { ...request, requestId });
    } catch (error) {
      clearTimeout(timer);
      pending.delete(requestId);
      reject(error);
    }
  });
}
export const pluginPublishSessions = new PluginPublishSessions(async id => {
  const directory = path.join(PathUtil.getAppDir(), "plugins");
  const artifact = await readPluginPackage(path.join(directory, id), app.getVersion());
  if (artifact.manifest.id !== id) throw new Error("发布插件身份无效");
  if (!(await readLocalPluginState(directory)).enabled[id]) throw new Error("发布插件尚未启用");
}, send);
