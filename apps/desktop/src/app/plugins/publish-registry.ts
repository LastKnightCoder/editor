import type {
  Disposable,
  PluginContext,
  PublishInstance,
  PublishProviderDefinition,
  PublicationSnapshot,
} from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";
import { assertPublishPath } from "@tau/plugins/template";
import type { PublishRendererRequest } from "../../../shared/publish-renderer";

interface Registration {
  context: PluginContext;
  definition: PublishProviderDefinition;
}
interface Session {
  registration: Registration;
  provider: PublishInstance;
  controller: AbortController;
  pending: Set<Promise<unknown>>;
}

export class RendererPublishRegistry {
  private readonly registrations = new Map<string, Registration>();
  private readonly sessions = new Map<string, Session>();
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getRevision = () => this.revision;
  notifyChanged = () => this.changed();
  list() {
    return [...this.registrations.values()]
      .filter(item => !item.context.signal.aborted)
      .map(item => ({ id: item.context.pluginId, name: item.definition.name }));
  }
  private changed() {
    this.revision++;
    for (const listener of this.listeners) listener();
  }
  register(context: PluginContext, definition: PublishProviderDefinition): Disposable {
    if (this.registrations.has(context.pluginId)) throw new Error("插件已注册发布提供方");
    const registration = { context, definition };
    this.registrations.set(context.pluginId, registration);
    this.changed();
    return {
      dispose: async () => {
        if (this.registrations.get(context.pluginId) === registration)
          this.registrations.delete(context.pluginId);
        this.changed();
        await Promise.allSettled(
          [...this.sessions]
            .filter(([, item]) => item.registration === registration)
            .map(([session]) => this.execute({ kind: "close", session }))
        );
      },
    };
  }
  async execute(request: PublishRendererRequest): Promise<unknown> {
    if (request.kind === "open") {
      if (this.sessions.has(request.session)) throw new Error("发布会话重复");
      const registration = this.registrations.get(request.pluginId);
      if (!registration || registration.context.signal.aborted)
        throw new Error("发布插件未在当前窗口启用");
      const provider = registration.definition.create(copyJson(request.config));
      if (
        !provider ||
        typeof provider.describe !== "function" ||
        typeof provider.checkConnection !== "function" ||
        (provider.mode === "files"
          ? typeof provider.uploadFile !== "function" || typeof provider.deleteFile !== "function"
          : provider.mode !== "snapshot" || typeof provider.publish !== "function")
      )
        throw new Error("发布提供方实现不完整");
      if (
        provider.mode === "files" &&
        provider.concurrency !== undefined &&
        (!Number.isInteger(provider.concurrency) ||
          provider.concurrency < 1 ||
          provider.concurrency > 32)
      )
        throw new Error("发布并发上限无效");
      this.sessions.set(request.session, {
        registration,
        provider,
        controller: new AbortController(),
        pending: new Set(),
      });
      return {
        mode: provider.mode,
        concurrency: provider.mode === "files" ? (provider.concurrency ?? 10) : 1,
      };
    }
    const session = this.sessions.get(request.session);
    if (request.kind === "close") {
      if (!session) return;
      this.sessions.delete(request.session);
      session.controller.abort();
      await Promise.allSettled([...session.pending]);
      await session.provider.dispose?.();
      return;
    }
    if (!session) throw new Error("发布会话已结束");
    const signal = AbortSignal.any([
      session.controller.signal,
      session.registration.context.signal,
    ]);
    signal.throwIfAborted();
    const operation = (async () => {
      const { provider } = session;
      const [name, bytes] = request.args;
      if (request.method === "describe") return provider.describe(signal);
      if (request.method === "checkConnection") return provider.checkConnection(signal);
      if (request.method === "publish" && provider.mode === "snapshot") {
        const snapshot = name as PublicationSnapshot;
        if (
          !snapshot ||
          typeof snapshot.id !== "string" ||
          !Array.isArray(snapshot.files) ||
          !Array.isArray(snapshot.deletions)
        )
          throw new Error("发布快照无效");
        snapshot.files.forEach(file => assertPublishPath(file.path));
        snapshot.deletions.forEach(assertPublishPath);
        return provider.publish(snapshot, signal);
      }
      if (provider.mode !== "files" || typeof name !== "string") throw new Error("发布操作无效");
      assertPublishPath(name);
      if (request.method === "uploadFile" && bytes instanceof Uint8Array)
        return provider.uploadFile(name, bytes, signal);
      if (request.method === "deleteFile") return provider.deleteFile(name, signal);
      throw new Error("发布操作无效");
    })();
    session.pending.add(operation);
    try {
      const result = await operation;
      signal.throwIfAborted();
      return result;
    } finally {
      session.pending.delete(operation);
    }
  }
}
export const rendererPublishRegistry = new RendererPublishRegistry();
