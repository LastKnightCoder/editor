import { invoke } from "@tauri-apps/api/core";
import type { ImageFile, ImageOptions } from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";
import { MAX_IMAGE_BYTES, MAX_IMAGES, validateImageFiles } from "@tau/plugins/images-host";
import { getMobileImageHost } from "./plugin-images";
import { getMobileSettingSnapshot } from "./mobileSettingsBridge";
import { uploadResource } from "./tauri";

export interface MobileImageTask {
  database: string;
  prompt: string;
  imagePaths?: readonly string[];
  options?: ImageOptions;
  signal: AbortSignal;
}

function imageType(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP"
  )
    return "image/webp";
  throw new Error("参考图只支持 PNG、JPEG 或 WebP");
}

function decodeImage(value: string) {
  if (value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4)
    throw new Error("参考图片不能超过 128 MiB");
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

async function readRemoteImage(response: Response, signal: AbortSignal) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`参考图片下载失败：${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("参考图片内容为空");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) throw new Error("参考图片不能超过 128 MiB");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function generateMobileImageResources(task: MobileImageTask) {
  const host = getMobileImageHost(task.database);
  const signal = AbortSignal.any([task.signal, host.signal]);
  const check = () => {
    signal.throwIfAborted();
    if (getMobileSettingSnapshot()?.database.active !== task.database)
      throw new DOMException("数据库已切换，图片任务已取消", "AbortError");
  };
  check();
  const setting = getMobileSettingSnapshot()?.imageGeneration;
  const selected = setting?.providers.find(item => item.id === setting.currentProviderId);
  if (!selected) throw new Error("请先在设置的「图片生成」中选择并配置图片插件账号");
  const config = { ...selected, config: copyJson(selected.config) };
  const registration = host.runtime.images
    .list()
    .find(item => item.context.pluginId === config.pluginId);
  if (!registration || !host.runtime.active(registration.context))
    throw new Error("当前图片插件未启用，请到插件中心启用");
  const executionSignal = AbortSignal.any([signal, registration.context.signal]);
  const paths = task.imagePaths ?? [];
  if (paths.length > MAX_IMAGES) throw new Error("单次最多使用 16 张参考图");
  const images: ImageFile[] = [];
  let totalBytes = 0;
  for (const path of paths) {
    check();
    executionSignal.throwIfAborted();
    let content: Uint8Array;
    if (path.startsWith("data:")) {
      const match = /^data:image\/(?:png|jpeg|webp);base64,([\s\S]+)$/.exec(path);
      if (!match) throw new Error("参考图片 data URL 无效");
      content = decodeImage(match[1]);
    } else if (/^https?:\/\//i.test(path)) {
      if (!host.runtime.fetch) throw new Error("图片网络尚未就绪");
      content = await readRemoteImage(
        await host.runtime.fetch(path, { signal: executionSignal }),
        executionSignal
      );
    } else {
      const localPath = path.startsWith("file:")
        ? decodeURIComponent(new URL(path).pathname)
        : path;
      content = decodeImage(
        await invoke<string>("read_image_resource", { database: task.database, path: localPath })
      );
    }
    check();
    totalBytes += content.byteLength;
    if (totalBytes > MAX_IMAGE_BYTES) throw new Error("参考图片总大小不能超过 128 MiB");
    const mimeType = imageType(content);
    const extension = mimeType.split("/")[1];
    images.push({ name: `reference-${images.length + 1}.${extension}`, mimeType, content });
  }
  if (images.length) validateImageFiles(images);
  const request = { prompt: task.prompt.trim(), options: task.options };
  let results;
  try {
    results = await host.runtime.images.execute(
      config.pluginId,
      config.config,
      config.modelId,
      images.length
        ? { kind: "edit", request: { ...request, images } }
        : { kind: "generate", request },
      executionSignal
    );
  } catch (error) {
    executionSignal.throwIfAborted();
    // 提供方错误可能包含鉴权信息，不把原始服务响应写进对话历史。
    if (error instanceof Error && /^当前模型不支持图片/.test(error.message)) throw error;
    throw new Error("图片请求失败，请检查插件账号、模型与网络后重试");
  }
  const uploaded: { url: string; fileName: string; mimeType: string; revisedPrompt?: string }[] =
    [];
  for (const result of results) {
    check();
    executionSignal.throwIfAborted();
    const fileName = `ai-image-${crypto.randomUUID()}.${result.mimeType.split("/")[1]}`;
    const url = await uploadResource({
      database: task.database,
      signal: executionSignal,
      fileName,
      mimeType: result.mimeType,
      content: new Blob([result.content.slice().buffer], { type: result.mimeType }),
    });
    check();
    executionSignal.throwIfAborted();
    uploaded.push({
      url,
      fileName,
      mimeType: result.mimeType,
      ...(result.revisedPrompt ? { revisedPrompt: result.revisedPrompt } : {}),
    });
  }
  return uploaded;
}
