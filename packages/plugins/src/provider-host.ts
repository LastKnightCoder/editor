import type { PluginContext, Disposable } from "./index";
import { copyJson } from "./host";
import type { SyncProvider, SyncProviderDefinition } from "./sync";
import type { UploadFile, UploadProviderDefinition, JsonValue } from "./index";
export type SyncRendererRequest =
  | { kind: "open"; session: string; pluginId: string; config: import("./json").JsonValue }
  | { kind: "call"; session: string; method: keyof SyncProvider; args: unknown[] }
  | { kind: "close"; session: string };

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
  list() {
    return [...this.registrations.values()];
  }
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
      const result = await operation;
      if (
        session.registration.context.signal.aborted ||
        this.sessions.get(request.session) !== session
      )
        throw new DOMException("同步插件已停用", "AbortError");
      if (
        (request.method === "uploadFile" ||
          request.method === "createFileIfAbsent" ||
          request.method === "fileExists") &&
        typeof result !== "boolean"
      )
        throw new Error("同步插件必须返回布尔状态");
      if (request.method === "downloadFile" && !(result instanceof Uint8Array))
        throw new Error("同步插件必须返回文件字节");
      if (request.method === "listFiles" && !Array.isArray(result))
        throw new Error("同步插件必须返回文件列表");
      return result;
    } finally {
      session.pending.delete(operation);
    }
  }
}

interface UploadRegistration {
  context: PluginContext;
  definition: UploadProviderDefinition;
  pending: Set<Promise<string>>;
}

/** 上传只在当前渲染进程执行，关闭或停用由插件上下文取消网络请求。 */
export class RendererUploadRegistry {
  private readonly registrations = new Map<string, UploadRegistration>();
  list() {
    return [...this.registrations.values()];
  }
  register(context: PluginContext, definition: UploadProviderDefinition): Disposable {
    if (this.registrations.has(context.pluginId)) throw new Error("插件已注册上传提供方");
    const registration = { context, definition, pending: new Set<Promise<string>>() };
    this.registrations.set(context.pluginId, registration);
    return {
      dispose: async () => {
        if (this.registrations.get(context.pluginId) === registration)
          this.registrations.delete(context.pluginId);
        await Promise.allSettled([...registration.pending]);
      },
    };
  }
  async upload(
    id: string,
    file: UploadFile,
    config: JsonValue,
    callSignal?: AbortSignal
  ): Promise<string> {
    const registration = this.registrations.get(id);
    if (!registration || registration.context.signal.aborted)
      throw new Error("资源上传插件未安装或未启用，请在插件中心安装并启用");
    const signal = AbortSignal.any([
      registration.context.signal,
      ...(callSignal ? [callSignal] : []),
    ]);
    signal.throwIfAborted();
    let onAbort: () => void = () => undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new DOMException("上传插件已停用", "AbortError"));
      signal.addEventListener("abort", onAbort, { once: true });
    });
    const operation = Promise.race([
      aborted,
      Promise.resolve().then(() => {
        signal.throwIfAborted();
        return registration.definition.upload(
          { ...file, content: new Uint8Array(file.content) },
          copyJson(config),
          signal
        );
      }),
    ]);
    registration.pending.add(operation);
    try {
      return await operation;
    } finally {
      signal.removeEventListener("abort", onAbort);
      registration.pending.delete(operation);
    }
  }
}
