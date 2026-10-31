import type { Disposable, JsonValue, PluginContext } from "./contract";
import type {
  GeneratedImage,
  ImageEditRequest,
  ImageGenerateRequest,
  ImageProviderDefinition,
} from "./images";
import { copyJson } from "./host";

export const MAX_IMAGE_BYTES = 128 * 1024 * 1024;
export const MAX_IMAGES = 16;

export function validateImageFiles(files: readonly { mimeType: string; content: Uint8Array }[]) {
  if (!Array.isArray(files) || !files.length || files.length > MAX_IMAGES)
    throw new Error("图片数量必须在 1 到 16 张之间");
  let bytes = 0;
  for (const file of files) {
    if (
      !file ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.mimeType) ||
      !(file.content instanceof Uint8Array) ||
      !file.content.byteLength
    )
      throw new Error("图片必须包含有效的 PNG、JPEG 或 WebP 字节");
    bytes += file.content.byteLength;
  }
  if (bytes > MAX_IMAGE_BYTES) throw new Error("图片总大小不能超过 128 MiB");
}

type ImageOperation =
  | { kind: "generate"; request: ImageGenerateRequest }
  | { kind: "edit"; request: ImageEditRequest };

/** 单次图片任务绑定提供方的激活代次，注销后即使插件未响应取消也不交付结果。 */
export class ImageProviderRegistry {
  private readonly registrations = new Map<
    string,
    { context: PluginContext; definition: ImageProviderDefinition; lifetime: AbortController }
  >();

  list() {
    return [...this.registrations.values()];
  }

  register(context: PluginContext, definition: ImageProviderDefinition): Disposable {
    context.signal.throwIfAborted();
    if (this.registrations.has(context.pluginId)) throw new Error("图片提供方已注册");
    const registration = { context, definition, lifetime: new AbortController() };
    this.registrations.set(context.pluginId, registration);
    const release = () => {
      if (this.registrations.get(context.pluginId) !== registration) return;
      this.registrations.delete(context.pluginId);
      registration.lifetime.abort(new DOMException("图片插件已停用", "AbortError"));
    };
    context.signal.addEventListener("abort", release, { once: true });
    return {
      dispose: () => {
        context.signal.removeEventListener("abort", release);
        release();
      },
    };
  }

  async execute(
    pluginId: string,
    config: JsonValue,
    modelId: string,
    operation: ImageOperation,
    callSignal: AbortSignal
  ): Promise<GeneratedImage[]> {
    callSignal.throwIfAborted();
    const registration = this.registrations.get(pluginId);
    if (!registration) throw new Error("图片插件未安装或未启用");
    const signal = AbortSignal.any([
      callSignal,
      registration.context.signal,
      registration.lifetime.signal,
    ]);
    signal.throwIfAborted();
    if (!operation.request.prompt?.trim()) throw new Error("图片要求不能为空");
    const count = operation.request.options?.count;
    if (count !== undefined && (!Number.isInteger(count) || count < 1 || count > MAX_IMAGES))
      throw new Error("图片数量必须是 1 到 16 的整数");
    if (operation.kind === "edit") validateImageFiles(operation.request.images);
    const instance = registration.definition.create(copyJson(config), modelId);
    signal.throwIfAborted();
    let abort!: () => void;
    const canceled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
    });
    try {
      const run = Promise.resolve().then(async () => {
        signal.throwIfAborted();
        let result: GeneratedImage[];
        if (operation.kind === "edit") {
          if (!instance?.edit) throw new Error("当前模型不支持图片编辑");
          result = await instance.edit(structuredClone(operation.request), signal);
        } else {
          if (!instance?.generate) throw new Error("当前模型不支持图片生成");
          result = await instance.generate(structuredClone(operation.request), signal);
        }
        signal.throwIfAborted();
        validateImageFiles(result);
        return structuredClone(result);
      });
      return await Promise.race([run, canceled]);
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
}
