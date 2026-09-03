import {
  FileImage,
  Video,
  AudioLines,
  FileText,
  BookOpen,
  Paperclip,
  Files,
  FileText as DocIcon,
  Presentation,
  Mic,
  MessageSquare,
  BookOpen as BookIcon,
} from "lucide-react";
import type { ResourceType } from "@/types";
import type { IResourceSource } from "@/types";

export interface ResourceTypeConfig {
  type: ResourceType | "all";
  label: string;
  icon: typeof FileImage;
  /** 类型化 icon tile 的渐变色(Tailwind 类,类型色为语义色不随主题变) */
  tileClass: string;
}

export const RESOURCE_TYPE_CONFIGS: ResourceTypeConfig[] = [
  {
    type: "all",
    label: "全部",
    icon: Files,
    tileClass: "from-zinc-500 to-zinc-600",
  },
  {
    type: "image",
    label: "图片",
    icon: FileImage,
    tileClass: "from-sky-500 to-blue-600",
  },
  {
    type: "video",
    label: "视频",
    icon: Video,
    tileClass: "from-emerald-500 to-teal-600",
  },
  {
    type: "audio",
    label: "音频",
    icon: AudioLines,
    tileClass: "from-amber-500 to-orange-600",
  },
  {
    type: "pdf",
    label: "PDF",
    icon: FileText,
    tileClass: "from-rose-500 to-red-600",
  },
  {
    type: "epub",
    label: "EPUB",
    icon: BookOpen,
    tileClass: "from-orange-500 to-amber-600",
  },
  {
    type: "attachment",
    label: "附件",
    icon: Paperclip,
    tileClass: "from-violet-500 to-purple-600",
  },
];

export const getResourceTypeConfig = (type: ResourceType) =>
  RESOURCE_TYPE_CONFIGS.find((c) => c.type === type) ??
  RESOURCE_TYPE_CONFIGS[0];

export const SOURCE_TYPE_MAP: Record<
  IResourceSource["type"],
  { label: string; icon: typeof DocIcon }
> = {
  content: { label: "文档", icon: DocIcon },
  whiteboard: { label: "白板", icon: Presentation },
  podcast: { label: "播客", icon: Mic },
  chat: { label: "聊天", icon: MessageSquare },
  ebook: { label: "电子书", icon: BookIcon },
};

export type ResourceSortBy = "updateTime" | "name" | "type" | "refCount";
export type ResourceSortOrder = "asc" | "desc";
export type ResourceViewMode = "grid" | "list";

export const RESOURCE_SORT_OPTIONS: Array<{
  value: ResourceSortBy;
  label: string;
}> = [
  { value: "updateTime", label: "更新时间" },
  { value: "name", label: "名称" },
  { value: "type", label: "类型" },
  { value: "refCount", label: "引用次数" },
];
