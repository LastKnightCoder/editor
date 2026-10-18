import type { PluginContext, Disposable } from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";
import type { SyncProvider, SyncProviderDefinition } from "@tau/plugins/sync";
import type { SyncRendererRequest } from "../../../shared/sync-renderer";

interface Registration {
  context: PluginContext;
  definition: SyncProviderDefinition;
}
interface Session {
  registration: Registration;
  provider: SyncProvider;
  pending: Set<Promise<unknown>>;
  closing?: Promise<void>;
}

/** 同步实现只在当前渲染进程创建和执行，主进程只能发送任务数据。 */
export class RendererSyncRegistry {
  private readonly registrations = new Map<string, Registration>();
  private readonly sessions = new Map<string, Session>();
  register(context: PluginContext, definition: SyncProviderDefinition): Disposable {
    if (this.registrations.has(context.pluginId)) throw new Error("插件已注册同步提供方");
    const registration = { context, definition };
    this.registrations.set(context.pluginId, registration);
    return {
      dispose: async () => {
        if (this.registrations.get(context.pluginId) === registration)
          this.registrations.delete(context.pluginId);
        await Promise.allSettled(
          [...this.sessions]
            .filter(([, session]) => session.registration === registration)
            .map(([session]) => this.execute({ kind: "close", session }))
        );
      },
    };
  }
  async execute(request: SyncRendererRequest): Promise<unknown> {
    if (request.kind === "open") {
      if (this.sessions.has(request.session)) throw new Error("同步任务重复");
      const registration = this.registrations.get(request.pluginId);
      if (!registration || registration.context.signal.aborted)
        throw new Error("同步插件未在当前窗口启用");
      const provider = registration.definition.create(copyJson(request.config));
      for (const method of [
        "uploadFile",
        "downloadFile",
        "fileExists",
        "listFiles",
        "createFileIfAbsent",
      ] as const)
        if (typeof provider?.[method] !== "function") throw new Error("同步提供方实现不完整");
      this.sessions.set(request.session, { registration, provider, pending: new Set() });
      return;
    }
    const session = this.sessions.get(request.session);
    if (request.kind === "close") {
      if (!session) return;
      session.closing ??= (async () => {
        await Promise.allSettled([...session.pending]);
        this.sessions.delete(request.session);
      })();
      return session.closing;
    }
    if (!session || session.closing || session.registration.context.signal.aborted)
      throw new Error("同步任务已结束");
    const operation = (async () => {
      const { provider } = session,
        [name, data] = request.args;
      if (request.method === "listFiles" && (name === undefined || typeof name === "string"))
        return provider.listFiles(name);
      if (typeof name !== "string") throw new Error("同步文件名无效");
      if (request.method === "fileExists") return provider.fileExists(name);
      if (request.method === "downloadFile") return provider.downloadFile(name);
      if (
        (request.method === "uploadFile" || request.method === "createFileIfAbsent") &&
        data instanceof Uint8Array
      )
        return provider[request.method](name, data);
      throw new Error("同步操作或参数无效");
    })();
    session.pending.add(operation);
    try {
      return await operation;
    } finally {
      session.pending.delete(operation);
    }
  }
}
export const rendererSyncRegistry = new RendererSyncRegistry();
