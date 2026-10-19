import type { ImageOptions } from "@tau/plugins";
import useSettingStore from "@/stores/useSettingStore";
import type { ImageProviderConfig, UploadedImageResult } from "@/types/imageGeneration";
import { createImageFile, resolveImageInputFile } from "@/utils/image-generation/shared";
import { openPluginImages } from "./plugin-images";

export interface ImageTask {
  config?: ImageProviderConfig;
  prompt: string;
  imagePaths?: readonly string[];
  options?: ImageOptions;
  signal?: AbortSignal;
}

export async function generateImageResources(task: ImageTask): Promise<UploadedImageResult[]> {
  const prompt = task.prompt.trim();
  if (!prompt) throw new Error("请输入图片要求");
  const { imageGeneration, database } = useSettingStore.getState().setting;
  const config =
    task.config ??
    imageGeneration.providers.find(item => item.id === imageGeneration.currentProviderId);
  if (!config) throw new Error("请先在图片生成设置中选择并配置图片插件账号");
  task.signal?.throwIfAborted();
  const instance = await openPluginImages(config, task.signal);
  const check = () => {
    instance.signal.throwIfAborted();
    if (useSettingStore.getState().setting.database.active !== database.active)
      throw new DOMException("数据库已切换，图片任务已取消", "AbortError");
  };
  try {
    check();
    const imagePaths = task.imagePaths?.map(path => path.trim()).filter(Boolean) ?? [];
    if (imagePaths.length > 16) throw new Error("单次最多使用 16 张参考图");
    if (imagePaths.length ? !instance.canEdit : !instance.canGenerate)
      throw new Error(imagePaths.length ? "当前模型不支持图片编辑" : "当前模型不支持图片生成");
    const request = { prompt, options: task.options };
    const results = imagePaths.length
      ? await instance.edit({
          ...request,
          images: await Promise.all(
            imagePaths.map(async path => {
              const file = await resolveImageInputFile(path, {}, instance.signal);
              check();
              return {
                name: file.name,
                mimeType: file.type,
                content: new Uint8Array(await file.arrayBuffer()),
              };
            })
          ),
        })
      : await instance.generate(request);
    check();
    const { uploadResource } = await import("@/hooks/useUploadResource");
    const uploaded: UploadedImageResult[] = [];
    for (const result of results) {
      check();
      const file = createImageFile(result.content, result.mimeType, "ai-image");
      const url = await uploadResource(file, instance.signal);
      check();
      uploaded.push({
        url,
        fileName: file.name,
        mimeType: file.type,
        revisedPrompt: result.revisedPrompt,
      });
    }
    return uploaded;
  } finally {
    await instance.dispose();
  }
}
