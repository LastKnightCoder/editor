import type { GeneratedImage, ImageEditRequest, ImageGenerateRequest } from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";
import type { ImageProviderConfig } from "@/types/imageGeneration";
import type { ImagesSessionInfo } from "../../shared/images-renderer";
import { callPluginImages } from "@/commands/plugin-images";
import { on, off } from "@/electron";

export async function openPluginImages(setting: ImageProviderConfig, signal?: AbortSignal) {
  const session = crypto.randomUUID();
  const snapshot = {
    pluginId: setting.pluginId,
    modelId: setting.modelId,
    config: copyJson(setting.config),
  };
  const lifetime = new AbortController();
  const executionSignal = AbortSignal.any([lifetime.signal, ...(signal ? [signal] : [])]);
  const onClosed = (_event: unknown, message: { session: string }) => {
    if (message.session === session)
      lifetime.abort(new DOMException("图片会话已关闭或插件已停用", "AbortError"));
  };
  on("plugin-images:session-closed", onClosed);
  let info: ImagesSessionInfo;
  try {
    info = await callPluginImages<ImagesSessionInfo>(
      { kind: "open", session, ...snapshot },
      executionSignal
    );
  } catch (error) {
    off("plugin-images:session-closed", onClosed);
    await callPluginImages({ kind: "close", session }).catch(() => undefined);
    throw error;
  }
  let closed = false;
  const dispose = async () => {
    if (closed) return;
    closed = true;
    off("plugin-images:session-closed", onClosed);
    signal?.removeEventListener("abort", stop);
    await callPluginImages({ kind: "close", session });
  };
  const stop = () => {
    void dispose().catch(() => undefined);
  };
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) {
    await dispose();
    signal.throwIfAborted();
  }
  const taskSignal = (call?: AbortSignal) => {
    if (closed) throw new DOMException("图片任务已结束", "AbortError");
    return AbortSignal.any([executionSignal, ...(call ? [call] : [])]);
  };
  return {
    ...info,
    signal: executionSignal,
    generate: (request: ImageGenerateRequest, call?: AbortSignal) => {
      if (!info.canGenerate) throw new Error("当前模型不支持图片生成");
      return callPluginImages<GeneratedImage[]>(
        { kind: "generate", session, request },
        taskSignal(call)
      );
    },
    edit: (request: ImageEditRequest, call?: AbortSignal) => {
      if (!info.canEdit) throw new Error("当前模型不支持图片编辑");
      return callPluginImages<GeneratedImage[]>(
        { kind: "edit", session, request },
        taskSignal(call)
      );
    },
    dispose,
  };
}
