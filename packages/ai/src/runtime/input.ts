import type { UserMessage, ImageContent } from "@earendil-works/pi-ai";
import type { MessageContent } from "@tau/shared/chat-core";
import { AiError } from "../contracts";

export function prepareUserContent(content: MessageContent[]): UserMessage["content"] {
  const blocks: Exclude<UserMessage["content"], string> = [];
  for (const item of content) {
    if (item.type === "text") {
      blocks.push({ type: "text", text: item.text });
      continue;
    }
    if (item.type === "image") {
      const data = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(item.image);
      if (data) {
        blocks.push({ type: "image", mimeType: data[1], data: data[2].replace(/[\r\n]/g, "") });
        continue;
      }
    }
    throw new AiError(
      "AI_ATTACHMENT_UNAVAILABLE",
      "附件需要宿主资源解析，不能把其他设备的本机路径当作可用附件"
    );
  }
  if (!blocks.some(block => block.type === "image" || (block.type === "text" && block.text.trim())))
    throw new AiError("AI_SESSION_INVALID", "消息内容不能为空");
  return blocks;
}

export function prepareInlineImages(
  images: readonly { data: string; mimeType: string }[]
): ImageContent[] {
  if (!Array.isArray(images)) throw new AiError("AI_ATTACHMENT_UNAVAILABLE", "图片列表格式无效");
  return images.map(image => {
    if (
      !image ||
      typeof image.data !== "string" ||
      !/^[A-Za-z0-9+/=\r\n]+$/.test(image.data) ||
      !/^image\/[\w.+-]+$/.test(image.mimeType)
    )
      throw new AiError("AI_ATTACHMENT_UNAVAILABLE", "图片必须提供有效的 MIME 与 base64 数据");
    return { type: "image", mimeType: image.mimeType, data: image.data.replace(/[\r\n]/g, "") };
  });
}

export function assertImageSupport(
  model: { input: readonly string[] },
  messages: readonly { content?: unknown }[]
): void {
  const containsImage = messages.some(
    message =>
      Array.isArray(message.content) &&
      message.content.some(block => block && typeof block === "object" && block.type === "image")
  );
  if (containsImage && !model.input?.includes("image"))
    throw new AiError("AI_MODEL_UNAVAILABLE", "所选模型不支持图片输入，请选择支持图片的模型");
}

export const userModelText = (content: UserMessage["content"]): string =>
  typeof content === "string"
    ? content
    : content
        .filter(block => block.type === "text")
        .map(block => block.text)
        .join("");
