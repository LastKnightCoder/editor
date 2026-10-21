/**
 * 脉络的纯函数：关联计数、实体与谱系端点、被使用条目的展示元信息。
 */

import {
  FileText,
  FlaskConical,
  FolderKanban,
  CircleHelp,
  Globe,
  Highlighter,
  Layers,
  ListTodo,
  MessageCircle,
  PenLine,
  Presentation,
  Repeat,
  Puzzle,
  type LucideIcon,
} from "lucide-react";
import type { LineageNodeKind } from "@/entity/lineage";
import type { EntityRefKind } from "@/entity/ref";
import type { ContextUsage, EntityContext } from "@/types/entity-context";

export const ENTITY_KIND_META: Record<EntityRefKind, { label: string; icon: LucideIcon }> = {
  card: { label: "卡片", icon: Layers },
  article: { label: "文章", icon: FileText },
  "project-item": { label: "项目文档", icon: FolderKanban },
  "diary-moment": { label: "日记", icon: PenLine },
  "plugin-entity": { label: "插件内容", icon: Puzzle },
};

/** 图标与侧边栏对应入口一致 */
export const LINEAGE_KIND_META: Record<LineageNodeKind, { label: string; icon: LucideIcon }> = {
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

export const USAGE_KIND_ICON: Record<ContextUsage["kind"], LucideIcon> = {
  whiteboard: Presentation,
  todo: ListTodo,
  notebook: FlaskConical,
};

/**
 * 元信息行显示的关联数：连接（显式连接 + 内联出链）+ 引用我的来源 + 共用正文的身份
 * （含 Notebook 笔记）+ 相关问题 + 被插件内容关联 + 来源 + 衍生 + 被使用（KL-023）
 */
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
