// 脉络的纯函数：关联计数、类型图标与标签。口径对齐桌面端 features/context/model.ts，
// 移动端裁剪掉「相关」与白板被使用，计数里没有这两项。

import type { LucideIcon } from "lucide-react";
import {
  CircleHelp,
  FileText,
  FlaskConical,
  FolderKanban,
  Globe,
  Highlighter,
  Layers,
  ListTodo,
  MessageCircle,
  PenLine,
  Puzzle,
  Repeat,
} from "lucide-react";
import type { EntityContext } from "./types";

export const ENTITY_KIND_META: Record<string, { label: string; icon: LucideIcon }> = {
  card: { label: "卡片", icon: Layers },
  article: { label: "文章", icon: FileText },
  "project-item": { label: "项目文档", icon: FolderKanban },
  "diary-moment": { label: "日记", icon: PenLine },
  "plugin-entity": { label: "插件内容", icon: Puzzle },
};

export const LINEAGE_KIND_META: Record<string, { label: string; icon: LucideIcon }> = {
  ...ENTITY_KIND_META,
  "chat-session": { label: "对话", icon: MessageCircle },
  "vl-note": { label: "Notebook 笔记", icon: FlaskConical },
  excerpt: { label: "摘录", icon: Highlighter },
  "pdf-annotation": { label: "PDF 标注", icon: FileText },
  "web-clip": { label: "解析文档", icon: Globe },
  flashcard: { label: "闪卡", icon: Repeat },
  question: { label: "问题", icon: CircleHelp },
  "vl-project": { label: "Notebook", icon: FlaskConical },
};

export const USAGE_KIND_META: Record<string, { label: string; icon: LucideIcon }> = {
  todo: { label: "待办", icon: ListTodo },
  notebook: { label: "Notebook", icon: FlaskConical },
};

/** 元信息行显示的关联数（对齐桌面 contextCount，无「相关」分区） */
export function contextCount(context: EntityContext | null | undefined): number {
  if (!context) return 0;
  return (
    context.links.length +
    context.backlinkTotal +
    context.projections.length +
    context.notebookProjections.length +
    context.questions.length +
    context.pluginLinks.length +
    context.sources.length +
    context.derived.length +
    context.usages.length
  );
}
