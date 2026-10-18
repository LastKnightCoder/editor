import type {
  PluginContext,
  Disposable,
  UploadFile,
  UploadProviderDefinition,
  JsonValue,
} from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";

interface Registration {
  context: PluginContext;
  definition: UploadProviderDefinition;
  pending: Set<Promise<string>>;
}

/** 上传只在当前渲染进程执行，关闭或停用由插件上下文取消网络请求。 */
export class RendererUploadRegistry {
  private readonly registrations = new Map<string, Registration>();
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
  async upload(id: string, file: UploadFile, config: JsonValue): Promise<string> {
    const registration = this.registrations.get(id);
    if (!registration || registration.context.signal.aborted)
      throw new Error("资源上传插件未安装或未启用，请在插件中心安装并启用");
    const signal = registration.context.signal;
    let onAbort = () => {};
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
          copyJson(config)
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
export const rendererUploadRegistry = new RendererUploadRegistry();
