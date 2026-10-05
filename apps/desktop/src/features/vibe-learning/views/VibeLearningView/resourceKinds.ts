/** 资料类型 → 图标 / 打开方式（目录与阅读区共用） */

import {
  AudioLines,
  Clapperboard,
  FileText,
  Globe,
  Highlighter,
  Image,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";
import type { VLResource, VLResourceType } from "@/types/vibe-learning";
import { remoteResourceToLocal } from "@/utils";
import { openFileWithDefaultApp } from "@/commands/file";
import { toast } from "@tau/ui";

export function resourceIcon(resource: VLResource): LucideIcon {
  if (resource.sourceType === "note") return NotebookPen;
  if (resource.sourceType === "material") return Highlighter;
  switch (resource.resourceType) {
    case "audio":
      return AudioLines;
    case "video":
      return Clapperboard;
    case "image":
      return Image;
    case "html":
      return Globe;
    default:
      return FileText;
  }
}

/** 文档类：页内显示转换后的文本，原件用系统默认程序打开 */
export const DOCUMENT_TYPES: VLResourceType[] = [
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "txt",
  "md",
  "other",
];

/** 笔记与外部材料资源没有原件文件 */
export const isDocument = (resource: VLResource) =>
  resource.sourceType !== "note" &&
  resource.sourceType !== "material" &&
  DOCUMENT_TYPES.includes(resource.resourceType);

/** 能在阅读区打开：音视频 / 网页 / 图片 / 笔记 / 外部材料，以及已转换出文本的文档 */
export const canOpenInStage = (resource: VLResource) =>
  resource.sourceType === "note" ||
  resource.sourceType === "material" ||
  ["video", "audio", "html", "image"].includes(resource.resourceType) ||
  (isDocument(resource) && !!resource.markdownPath);

export async function openResourceExternally(resource: VLResource) {
  try {
    const localPath = await remoteResourceToLocal(resource.originalPath);
    await openFileWithDefaultApp(localPath);
  } catch (error) {
    console.error("Open file failed:", error);
    toast.error("打开文件失败");
  }
}
