import { generateImageResources } from "@/services/image-generation";

export const validateImageUrl = (value: string) => {
  const url = value.trim();
  if (!url) {
    throw Object.assign(new Error("请输入图片 URL"), { code: "WHITEBOARD_IMAGE_URL_REQUIRED" });
  }
  if (!/^https?:\/\//i.test(url)) {
    throw Object.assign(new Error("请输入以 http:// 或 https:// 开头的图片 URL"), {
      code: "WHITEBOARD_IMAGE_URL_PROTOCOL",
    });
  }
  return url;
};

export const generateWhiteboardImage = async (prompt: string, signal?: AbortSignal) => {
  const [result] = await generateImageResources({ prompt, signal });
  if (!result)
    throw Object.assign(new Error("图片生成服务未返回图片"), {
      code: "WHITEBOARD_IMAGE_RESULT_EMPTY",
    });
  return result;
};
