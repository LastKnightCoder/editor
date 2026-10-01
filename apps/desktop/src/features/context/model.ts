/**
 * 脉络的纯函数：关联计数、实体类型的展示元信息。
 */

import { FileText, FolderKanban, Layers, PenLine, type LucideIcon } from "lucide-react";
import type { EntityRefKind } from "@/entity/ref";
import type { EntityContext } from "@/types/entity-context";

export const ENTITY_KIND_META: Record<EntityRefKind, { label: string; icon: LucideIcon }> = {
  card: { label: "卡片", icon: Layers },
  article: { label: "文章", icon: FileText },
  "project-item": { label: "项目文档", icon: FolderKanban },
  diary: { label: "日记", icon: PenLine },
};

/** 元信息行显示的关联数：引用了 + 引用我的来源 + 共用正文的身份 + 相关问题 */
export function contextCount(
  context: EntityContext | null | undefined,
  options: { hideOutlinks?: boolean } = {}
): number {
  if (!context) return 0;
  return (
    (options.hideOutlinks ? 0 : context.outlinks.length) +
    context.backlinkTotal +
    context.projections.length +
    context.questions.length
  );
}
