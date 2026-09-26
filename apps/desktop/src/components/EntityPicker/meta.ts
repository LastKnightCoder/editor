import {
  CalendarDays,
  File,
  FileText,
  FolderKanban,
  Layers,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import type { EntityKind } from "@/types";

/** 实体类型的展示口径（与问题材料 TARGET_META 同图标） */
export const ENTITY_KIND_META: Record<EntityKind, { label: string; icon: LucideIcon }> = {
  card: { label: "卡片", icon: Layers },
  article: { label: "文章", icon: FileText },
  project_item: { label: "项目文档", icon: File },
  project: { label: "项目", icon: FolderKanban },
  white_board: { label: "白板", icon: Presentation },
  diary: { label: "日记", icon: CalendarDays },
};

export const entityKey = (c: { kind: EntityKind; id: number }) => `${c.kind}:${c.id}`;

/** 列表右侧时间：今天 / 昨天 / N 天前 / M月D日 / YYYY年M月 */
export function entityTime(ts: number, now = Date.now()): string {
  const day = (t: number) => new Date(new Date(t).toDateString()).getTime();
  const days = Math.round((day(now) - day(ts)) / 86_400_000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  const d = new Date(ts);
  return d.getFullYear() === new Date(now).getFullYear()
    ? `${d.getMonth() + 1}月${d.getDate()}日`
    : `${d.getFullYear()}年${d.getMonth() + 1}月`;
}
