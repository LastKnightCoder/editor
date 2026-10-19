import type {
  Disposable,
  GeneratedImage,
  ImageInstance,
  ImageProviderDefinition,
  PluginContext,
} from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";
import type { ImagesRendererRequest, ImagesSessionInfo } from "../../../shared/images-renderer";

interface Registration {
  context: PluginContext;
  definition: ImageProviderDefinition;
}
interface Session {
  registration: Registration;
  instance: ImageInstance;
  controller: AbortController;
}

const MAX_IMAGES = 16;
const MAX_BYTES = 128 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function validateFiles(files: readonly { mimeType: string; content: Uint8Array }[]) {
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_IMAGES)
    throw new Error("图片数量必须在 1 到 16 张之间");
  let bytes = 0;
  for (const file of files) {
    if (
      !file ||
      !IMAGE_TYPES.has(file.mimeType) ||
      !(file.content instanceof Uint8Array) ||
      !file.content.byteLength
    )
      throw new Error("图片必须包含有效的 PNG、JPEG 或 WebP 字节");
    bytes += file.content.byteLength;
  }
  if (bytes > MAX_BYTES) throw new Error("图片总大小不能超过 128 MiB");
}

export class RendererImagesRegistry {
  private readonly registrations = new Map<string, Registration>();
  private readonly sessions = new Map<string, Session>();
  private readonly closedListeners = new Set<(id: string) => void>();
  private readonly listeners = new Set<() => void>();
  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  notifyChanged = () => {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error("图片能力变更通知失败", error);
      }
    }
  };
  onClose(listener: (id: string) => void) {
    this.closedListeners.add(listener);
    return () => {
      this.closedListeners.delete(listener);
    };
  }
  register(context: PluginContext, definition: ImageProviderDefinition): Disposable {
    if (this.registrations.has(context.pluginId)) throw new Error("图片提供方已注册");
    const registration = { context, definition };
    this.registrations.set(context.pluginId, registration);
    this.notifyChanged();
    const release = () => {
      if (this.registrations.get(context.pluginId) !== registration) return;
      this.registrations.delete(context.pluginId);
      for (const [id, session] of this.sessions)
        if (session.registration === registration) this.close(id);
      this.notifyChanged();
    };
    context.signal.addEventListener("abort", release, { once: true });
    return {
      dispose: () => {
        context.signal.removeEventListener("abort", release);
        release();
      },
    };
  }
  close(id: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    session.controller.abort(new DOMException("图片任务已结束或插件已停用", "AbortError"));
    for (const listener of this.closedListeners) {
      try {
        listener(id);
      } catch (error) {
        console.error("图片会话关闭通知失败", error);
      }
    }
  }
  async execute(request: ImagesRendererRequest, callSignal: AbortSignal): Promise<unknown> {
    callSignal.throwIfAborted();
    if (request.kind === "close") {
      this.close(request.session);
      return;
    }
    if (request.kind === "open") {
      if (this.sessions.has(request.session)) throw new Error("图片任务已存在");
      const registration = this.registrations.get(request.pluginId);
      if (!registration || registration.context.signal.aborted)
        throw new Error("图片插件未安装或未启用");
      const instance = registration.definition.create(copyJson(request.config), request.modelId);
      if (
        !instance ||
        (typeof instance.generate !== "function" && typeof instance.edit !== "function")
      )
        throw new Error("图片提供方至少需要实现生成或编辑");
      this.sessions.set(request.session, {
        registration,
        instance,
        controller: new AbortController(),
      });
      return {
        canGenerate: typeof instance.generate === "function",
        canEdit: typeof instance.edit === "function",
      } satisfies ImagesSessionInfo;
    }
    const session = this.sessions.get(request.session);
    if (!session) throw new DOMException("图片任务已结束", "AbortError");
    const signal = AbortSignal.any([
      callSignal,
      session.controller.signal,
      session.registration.context.signal,
    ]);
    signal.throwIfAborted();
    let abort!: () => void;
    const canceled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
    });
    try {
      const operation = Promise.resolve().then(async () => {
        signal.throwIfAborted();
        if (!request.request.prompt?.trim()) throw new Error("图片要求不能为空");
        let result: GeneratedImage[];
        if (request.kind === "edit") {
          if (!session.instance.edit) throw new Error("当前模型不支持图片编辑");
          validateFiles(request.request.images);
          result = await session.instance.edit(structuredClone(request.request), signal);
        } else {
          if (!session.instance.generate) throw new Error("当前模型不支持图片生成");
          result = await session.instance.generate(structuredClone(request.request), signal);
        }
        signal.throwIfAborted();
        validateFiles(result);
        return structuredClone(result);
      });
      return await Promise.race([operation, canceled]);
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
}

export const rendererImagesRegistry = new RendererImagesRegistry();
