// 对话里内容引用的类型外观：回答里的引用胶囊与工具结果行共用（日记紫、卡片绿、文章蓝……）。

import {
  FileText,
  FolderKanban,
  Layers,
  NotebookPen,
  Puzzle,
  Repeat,
  type LucideIcon,
} from "lucide-react";

export interface ReferenceKind {
  icon: LucideIcon;
  label: string;
  /** 胶囊底色 + 字色 */
  tone: string;
  /** 只着字色（无底色的图标） */
  text: string;
}

// Tailwind 只收静态类名，类名在这里写全
const KINDS: Record<string, ReferenceKind> = {
  card: { icon: Layers, label: "卡片", tone: "bg-tag-1-soft text-tag-1", text: "text-tag-1" },
  article: { icon: FileText, label: "文章", tone: "bg-tag-2-soft text-tag-2", text: "text-tag-2" },
  "project-item": {
    icon: FolderKanban,
    label: "项目文档",
    tone: "bg-tag-4-soft text-tag-4",
    text: "text-tag-4",
  },
  "diary-daily": {
    icon: NotebookPen,
    label: "日记",
    tone: "bg-tag-3-soft text-tag-3",
    text: "text-tag-3",
  },
  flashcard: { icon: Repeat, label: "闪卡", tone: "bg-tag-5-soft text-tag-5", text: "text-tag-5" },
  "plugin-entity": {
    icon: Puzzle,
    label: "插件内容",
    tone: "bg-tag-5-soft text-tag-5",
    text: "text-tag-5",
  },
};
const ALIASES: Record<string, string> = {
  project_item: "project-item",
  "diary-moment": "diary-daily",
  diary: "diary-daily",
};

export const FALLBACK_REFERENCE_KIND: ReferenceKind = {
  icon: FileText,
  label: "引用",
  tone: "bg-accent-soft text-accent-text",
  text: "text-accent-text",
};

export function referenceKindOf(type: string): ReferenceKind | null {
  return KINDS[ALIASES[type] ?? type] ?? null;
}
