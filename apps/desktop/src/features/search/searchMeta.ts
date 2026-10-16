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
  PenLine,
  FolderKanban,
  Globe,
  Highlighter,
  SunMoon,
  MessageCircle,
  CircleHelp,
  CalendarPlus,
  ListPlus,
  FileDown,
  Command,
  Activity,
  PackageOpen,
  FolderInput,
  type LucideIcon,
  Map as MapIcon,
} from "lucide-react";
import { NAV_SECTIONS, NAV_FOOTER } from "@/app/navigation";
import { getPageMeta } from "@/page/core/pageMeta";
import { isMaterialKind, MATERIAL_KINDS } from "@/entity/material";
import type { ContentIndexType, IndexType } from "@/types";
import type { PluginHost } from "@tau/plugins/host";

/** 内容实体类型 → 面板呈现（标签/类型色/图标）与跳转目标模块 */
export const CONTENT_TYPES: Record<
  IndexType,
  { label: string; navKey?: string; tag: string; icon: LucideIcon }
> = {
  card: { label: "卡片", navKey: "cards", tag: "bg-ok-soft text-ok", icon: Layers },
  article: { label: "文章", navKey: "articles", tag: "bg-info-soft text-info", icon: FileText },
  "project-item": {
    label: "项目",
    navKey: "projects",
    tag: "bg-tag-4-soft text-tag-4",
    icon: FolderKanban,
  },
  "diary-moment": { label: "日记", navKey: "diary", tag: "bg-warn-soft text-warn", icon: PenLine },
  // 外部材料：命中后经 openMaterialTarget 打开到原处，navKey 只在无法定位时兜底；摘录没有固定入口
  excerpt: { label: "划线", tag: "bg-tag-2-soft text-tag-2", icon: Highlighter },
  "pdf-annotation": {
    label: "PDF 标注",
    navKey: "pdfs",
    tag: "bg-tag-1-soft text-tag-1",
    icon: FileText,
  },
  "web-clip": { label: "剪藏", navKey: "projects", tag: "bg-tag-3-soft text-tag-3", icon: Globe },
};

/** 「摘录」一个范围覆盖三类外部材料 */
export type PaletteScope = ContentIndexType | "material" | "cmd";

/** chips 行顺序：全部由空 scopes 集表达，不单列 */
export const SCOPE_ORDER: PaletteScope[] = [
  "card",
  "article",
  "project-item",
  "diary-moment",
  "material",
  "cmd",
];

/** 范围 → 检索的索引类型（命令范围不检索内容） */
export function scopeTypes(scope: PaletteScope): IndexType[] {
  if (scope === "cmd") return [];
  return scope === "material" ? [...MATERIAL_KINDS] : [scope];
}

/** 结果类型归到哪个范围 chip（三类材料都算「摘录」） */
export function scopeOfType(type: IndexType): PaletteScope {
  return isMaterialKind(type) ? "material" : type;
}

export function scopeLabel(scope: PaletteScope): string {
  if (scope === "cmd") return "命令与页面";
  return scope === "material" ? "摘录" : CONTENT_TYPES[scope].label;
}

export function scopeIcon(scope: PaletteScope): LucideIcon {
  if (scope === "cmd") return Command;
  return scope === "material" ? Highlighter : CONTENT_TYPES[scope].icon;
}

/* ---------- 命令源 ---------- */

export interface PaletteCommand {
  id: string;
  label: string;
  section: string;
  icon: LucideIcon;
  /** 英文别名（小写包含匹配） */
  keywords?: string;
  kind: "page" | "action" | "plugin";
  run?: () => void | Promise<unknown>;
  pageKey?: string;
  action?:
    | "cycle-theme"
    | "open-settings"
    | "capture-question"
    | "capture-todo"
    | "capture-event"
    | "toggle-assist"
    | "open-markdown"
    | "export-markdown"
    | "import-batch"
    | "export-perf-snapshot";
}

let cached: PaletteCommand[] | null = null;

export function pluginPaletteCommands(
  host: Pick<PluginHost, "listCommands" | "executeCommand">
): PaletteCommand[] {
  return host.listCommands().map(command => ({
    id: `plugin:${command.id}`,
    label: command.title,
    section: "插件",
    icon: Command,
    kind: "plugin",
    run: () => host.executeCommand(command.id),
  }));
}

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
    ...NAV_FOOTER.map(item =>
      item.opensOverlay === "settings"
        ? {
            id: "action:open-settings",
            label: item.label,
            section: "工具",
            icon: item.icon,
            keywords: "settings preferences 设置 偏好 配置",
            kind: "action" as const,
            action: "open-settings" as const,
          }
        : {
            id: `page:${item.key}`,
            label: item.label,
            section: "工具",
            icon: item.icon,
            kind: "page" as const,
            pageKey: item.key,
          }
    ),
  ];
  cached = [
    ...pages,
    ...(import.meta.env.DEV
      ? [
          {
            id: "page:plugin-workbench",
            label: "插件开发台",
            section: "开发",
            icon: Command,
            keywords: "plugin 插件 开发 启用 停用",
            kind: "page" as const,
            pageKey: "plugin-workbench",
          },
        ]
      : []),
    {
      // 知识地图入口在标题栏，不在侧边栏（D-095）
      id: "page:knowledge-map",
      label: "知识地图",
      section: "知识",
      icon: MapIcon,
      keywords: "map graph 图谱 地图 关联 主题",
      kind: "page",
      pageKey: "knowledge-map",
    },
    {
      id: "action:cycle-theme",
      label: "切换深浅模式",
      section: "动作",
      icon: SunMoon,
      keywords: "theme dark light 外观",
      kind: "action",
      action: "cycle-theme",
    },
    {
      id: "action:toggle-assist",
      label: "开合 AI 对话栏",
      section: "动作",
      icon: MessageCircle,
      keywords: "ai chat assistant dock 对话 助手 停靠 ctrl+j",
      kind: "action",
      action: "toggle-assist",
    },
    {
      id: "action:capture-question",
      label: "记一个问题",
      section: "动作",
      icon: CircleHelp,
      keywords: "question capture 问题 收集 疑问",
      kind: "action",
      action: "capture-question",
    },
    {
      id: "action:capture-todo",
      label: "添加待办",
      section: "动作",
      icon: ListPlus,
      keywords: "todo task add 待办 任务 新建",
      kind: "action",
      action: "capture-todo",
    },
    {
      id: "action:capture-event",
      label: "添加日程",
      section: "动作",
      icon: CalendarPlus,
      keywords: "event schedule calendar add 日程 日历 新建",
      kind: "action",
      action: "capture-event",
    },
    {
      id: "action:open-markdown",
      label: "打开 Markdown 文件 / 文件夹",
      section: "动作",
      icon: FileDown,
      keywords: "markdown md open folder file 打开 本地 文件夹 typora",
      kind: "action",
      action: "open-markdown",
    },
    {
      id: "action:import-batch",
      label: "批量导入文件夹 / 压缩包…",
      section: "动作",
      icon: FolderInput,
      keywords:
        "import folder zip markdown obsidian typora migrate 导入 批量 文件夹 压缩包 迁移 迁入 笔记",
      kind: "action",
      action: "import-batch",
    },
    {
      id: "action:export-markdown",
      label: "导出为 Markdown 压缩包…",
      section: "动作",
      icon: PackageOpen,
      keywords:
        "export zip markdown obsidian backup migrate 导出 打包 压缩包 备份 迁移 迁出 项目 文章 卡片 全部 资源 图片",
      kind: "action",
      action: "export-markdown",
    },
    {
      id: "action:export-perf-snapshot",
      label: "导出性能快照",
      section: "动作",
      icon: Activity,
      keywords: "perf performance lag jank snapshot diagnose 卡顿 性能 诊断 日志",
      kind: "action",
      action: "export-perf-snapshot",
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

/* ---------- 访问记录可回跳判定 ---------- */

/**
 * 访问记录只存 page key，故只有 single 页面（无参即可还原实例）能作为「最近访问/常用」
 * 条目重放；params/multi 二级页缺 id 无法定位，push 会被参数净化整条拒绝，条目点了没反应。
 * 写入端（AppShell 记录）与展示端（SearchPalette 渲染）共用本判据，存量持久化记录同此过滤。
 */
export function isReplayableVisit(key: string): boolean {
  return getPageMeta(key)?.match === "single";
}
