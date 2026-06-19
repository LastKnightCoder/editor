import { uploadResource } from "@/hooks/useUploadResource";
import useSettingStore from "@/stores/useSettingStore";
import {
  createImageFileFromBase64,
  generateOpenAIImages,
  isImageGenerationConfigValid,
  resolveImageInputFile,
  type OpenAIImageResult,
} from "@/utils/openai-image-service";

export const validateImageUrl = (value: string) => {
  const url = value.trim();
  if (!url) {
    throw new Error("请输入图片 URL");
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("请输入以 http:// 或 https:// 开头的图片 URL");
  }
  return url;
};

const getGeneratedImageFile = async (result: OpenAIImageResult, index = 0) => {
  if (result.b64Json) {
    return createImageFileFromBase64(
      result.b64Json,
      result.mimeType ?? "image/png",
      `whiteboard-ai-image-${index + 1}`,
    );
  }

  if (result.url) {
    return resolveImageInputFile(result.url);
  }

  throw new Error("图片生成服务未返回可用图片");
};

export const generateWhiteboardImage = async (prompt: string) => {
  const finalPrompt = prompt.trim();
  if (!finalPrompt) {
    throw new Error("请输入图片生成要求");
  }

  const config = useSettingStore.getState().setting.imageGeneration;
  if (!isImageGenerationConfigValid(config)) {
    throw new Error(
      "图片生成配置无效，请先在设置中填写模型地址、API Key 和模型名称",
    );
  }

  const results = await generateOpenAIImages({
    config,
    prompt: finalPrompt,
  });
  if (!results.length) {
    throw new Error("图片生成服务未返回图片");
  }

  const file = await getGeneratedImageFile(results[0], 0);
  const url = await uploadResource(file);
  if (!url) {
    throw new Error("图片已生成，但上传资源失败");
  }

  return {
    url,
    fileName: file.name,
    mimeType: file.type,
    revisedPrompt: results[0].revisedPrompt,
  };
};
