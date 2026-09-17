/**
 * 搜索面板元数据 —— 内容类型映射（IndexType → 面板呈现/跳转目标）与命令源。
 *
 * 命令源消费 app/navigation.ts 的真实模块清单（分组/图标与侧边栏同源，单一事实源），
 * 外加真实可执行的动作（切换深浅主题）；未接线的动作不进面板。
 * 内容详情页（card-detail 等）迁移前，内容命中跳对应模块列表页（D-003 注记）。
 */

import {
  Layers,
  FileText,
  Book,
  PenLine,
  FolderKanban,
  SunMoon,
  Command,
  type LucideIcon,
} from "lucide-react";
import { NAV_SECTIONS, NAV_FOOTER } from "@/app/navigation";
import type { IndexType } from "@/types";

/** 内容实体类型 → 面板呈现（标签/类型色/图标）与跳转目标模块 */
export const CONTENT_TYPES: Record<
  IndexType,
  { label: string; navKey: string; tag: string; icon: LucideIcon }
> = {
  card: { label: "卡片", navKey: "cards", tag: "bg-ok-soft text-ok", icon: Layers },
  article: { label: "文章", navKey: "articles", tag: "bg-info-soft text-info", icon: FileText },
  "project-item": {
    label: "项目",
    navKey: "projects",
    tag: "bg-tag-4-soft text-tag-4",
    icon: FolderKanban,
  },
  "document-item": {
    label: "知识库",
    navKey: "library",
    tag: "bg-tag-3-soft text-tag-3",
    icon: Book,
  },
  "diary-daily": { label: "日记", navKey: "diary", tag: "bg-warn-soft text-warn", icon: PenLine },
};

export type PaletteScope = IndexType | "cmd";

/** chips 行顺序：全部由空 scopes 集表达，不单列 */
export const SCOPE_ORDER: PaletteScope[] = [
  "card",
  "article",
  "document-item",
  "project-item",
  "diary-daily",
  "cmd",
];

export function scopeLabel(scope: PaletteScope): string {
  return scope === "cmd" ? "命令与页面" : CONTENT_TYPES[scope].label;
}

export function scopeIcon(scope: PaletteScope): LucideIcon {
  return scope === "cmd" ? Command : CONTENT_TYPES[scope].icon;
}

/* ---------- 命令源 ---------- */

export interface PaletteCommand {
  id: string;
  label: string;
  section: string;
  icon: LucideIcon;
  /** 英文别名（小写包含匹配） */
  keywords?: string;
  kind: "page" | "action";
  pageKey?: string;
  action?: "cycle-theme";
}

let cached: PaletteCommand[] | null = null;

export function paletteCommands(): PaletteCommand[] {
  if (cached) return cached;
  const pages: PaletteCommand[] = [
    ...NAV_SECTIONS.flatMap(section =>
      section.items.map(item => ({
        id: `page:${item.key}`,
        label: item.label,
        section: section.label,
        icon: item.icon,
        kind: "page" as const,
        pageKey: item.key,
      }))
    ),
    ...NAV_FOOTER.map(item => ({
      id: `page:${item.key}`,
      label: item.label,
      section: "工具",
      icon: item.icon,
      kind: "page" as const,
      pageKey: item.key,
    })),
  ];
  cached = [
    ...pages,
    {
      id: "action:cycle-theme",
      label: "切换深浅主题",
      section: "动作",
      icon: SunMoon,
      keywords: "theme dark light 外观",
      kind: "action",
      action: "cycle-theme",
    },
  ];
  return cached;
}

/** 命令即时过滤（label / 分组 / 英文别名的小写包含匹配） */
export function matchCommands(commands: PaletteCommand[], q: string): PaletteCommand[] {
  if (!q) return commands;
  return commands.filter(
    c =>
      c.label.toLowerCase().includes(q) ||
      c.section.toLowerCase().includes(q) ||
      (c.keywords?.toLowerCase().includes(q) ?? false)
  );
}
