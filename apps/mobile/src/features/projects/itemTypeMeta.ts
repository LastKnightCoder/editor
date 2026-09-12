// 项目节点的八种类型：图标 + 语义色（与设计稿的类型图标体系一致）
import {
  FileText,
  Globe,
  Headphones,
  FileDown,
  BookOpen,
  Clapperboard,
  Presentation,
  Table2,
} from "lucide-react";
import type { ProjectItem } from "../../types";

export type ProjectItemTypeMeta = {
  label: string;
  icon: typeof FileText;
  className: string;
};

const TYPE_META: Record<string, ProjectItemTypeMeta> = {
  document: { label: "文档", icon: FileText, className: "bg-sky-soft text-sky" },
  "white-board": { label: "白板", icon: Presentation, className: "bg-rose-soft text-rose" },
  "video-note": { label: "视频笔记", icon: Clapperboard, className: "bg-lilac-soft text-lilac" },
  "audio-note": { label: "音频笔记", icon: Headphones, className: "bg-apricot-soft text-apricot" },
  "web-view": { label: "网页", icon: Globe, className: "bg-butter-soft text-butter" },
  "table-view": { label: "表格", icon: Table2, className: "bg-sky-soft text-sky" },
  pdf: { label: "PDF", icon: FileDown, className: "bg-rose-soft text-rose" },
  epub: { label: "EPUB", icon: BookOpen, className: "bg-sage-soft text-sage" },
};

export function projectItemTypeMeta(item: ProjectItem): ProjectItemTypeMeta {
  if (item.refType === "card") {
    return { label: "卡片", icon: FileText, className: "bg-apricot-soft text-apricot" };
  }
  if (item.refType === "article") {
    return { label: "文章", icon: FileText, className: "bg-rose-soft text-rose" };
  }
  const type = item.projectItemType || "document";
  return TYPE_META[type] ?? TYPE_META.document;
}

export const ADDABLE_ITEM_TYPES: Array<{ type: string; meta: ProjectItemTypeMeta; soon: boolean }> =
  [
    { type: "document", meta: TYPE_META.document, soon: false },
    { type: "white-board", meta: TYPE_META["white-board"], soon: true },
    { type: "video-note", meta: TYPE_META["video-note"], soon: true },
    { type: "audio-note", meta: TYPE_META["audio-note"], soon: true },
    { type: "web-view", meta: TYPE_META["web-view"], soon: true },
    { type: "table-view", meta: TYPE_META["table-view"], soon: true },
    { type: "pdf", meta: TYPE_META.pdf, soon: true },
    { type: "epub", meta: TYPE_META.epub, soon: true },
  ];
