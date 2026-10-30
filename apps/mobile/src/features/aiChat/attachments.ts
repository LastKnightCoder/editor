// 对话附件：@ 选中的笔记转成引用，拍照 / 相册的图片压成 data URL（模型按图片输入接收）。

import type { MentionEntityType, MentionRef } from "@tau/shared/chat-core";
import type { ContentLinkPickerResult } from "../cards/editorExtensions/ContentLinkPickerSheet";

const MENTION_TYPES: Record<string, MentionEntityType> = {
  card: "card",
  article: "article",
  "project-item": "project-item",
  "diary-daily": "diary",
  diary: "diary",
};

/** 内容引用选择器的结果 → 整篇引用；类型不在引用范围内时按卡片处理（模型只用 contentId 读正文） */
export function mentionFromPicker(result: ContentLinkPickerResult): MentionRef {
  return {
    entityType: MENTION_TYPES[result.contentType] ?? "card",
    entityId: result.refId,
    contentId: result.contentId,
    title: result.displayText,
    previewText: "",
  };
}

/** 长边压到 1568px（主流视觉模型的有效分辨率上限），JPEG 质量 0.85，避免原图几 MB 进上下文 */
const MAX_EDGE = 1568;

export async function imageFileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法处理图片");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    bitmap.close();
  }
}
