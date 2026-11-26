/**
 * 搜索面板元数据 —— 内容类型映射（IndexType → 面板呈现/跳转目标）与命令源。
 *
 * 命令源消费 app/navigation.ts 的真实模块清单（分组/图标与侧边栏同源，单一事实源），
 * 外加真实可执行的动作（切换深浅主题）；未接线的动作不进面板。
 * 内容详情页（card-detail 等）迁移前，内容命中跳对应模块列表页。
 */

import { searchMessages, searchTranslator } from "./i18n";
import { appMessages } from "@/app/i18n/messages";
import {
  Layers,
  FileText,
  PenLine,
  FolderKanban,
  Globe,
  Highlighter,
  SunMoon,
  MessageCircle,
  CalendarPlus,
  CalendarDays,
  ListPlus,
  ListTodo,
  Presentation,
  FlaskConical,
  BookOpen,
  Table,
  Repeat,
  FileDown,
  Command,
  Activity,
  PackageOpen,
  FolderInput,
  Puzzle,
  Camera,
  type LucideIcon,
  Map as MapIcon,
} from "lucide-react";
import { NAV_SECTIONS, NAV_FOOTER } from "@/app/navigation";
import { getPageMeta } from "@/page/core/pageMeta";
import { isMaterialKind, MATERIAL_KINDS } from "@/entity/material";
import type { ContentIndexType, IndexType } from "@/types";
import { CATALOG_SEARCH_TYPES, type CatalogSearchType } from "@/types/search";
import type { PluginHost } from "@tau/plugins/host";

export type PaletteSearchType = IndexType | CatalogSearchType | "document-task";

/** 内容实体类型 → 面板呈现（标签/类型色/图标）与跳转目标模块 */
export const CONTENT_TYPES: Record<
  PaletteSearchType,
  { label: string; navKey?: string; tag: string; icon: LucideIcon }
> = {
  card: {
    get label() {
      return searchTranslator.t("type.card");
    },
    navKey: "cards",
    tag: "bg-ok-soft text-ok",
    icon: Layers,
  },
  article: {
    get label() {
      return searchTranslator.t("type.article");
    },
    navKey: "articles",
    tag: "bg-info-soft text-info",
    icon: FileText,
  },
  "project-item": {
    get label() {
      return searchTranslator.t("type.project-item");
    },
    navKey: "projects",
    tag: "bg-tag-4-soft text-tag-4",
    icon: FolderKanban,
  },
  "diary-moment": {
    get label() {
      return searchTranslator.t("type.diary-moment");
    },
    navKey: "diary",
    tag: "bg-warn-soft text-warn",
    icon: PenLine,
  },
  // 外部材料：命中后经 openMaterialTarget 打开到原处，navKey 只在无法定位时兜底；摘录没有固定入口
  excerpt: {
    get label() {
      return searchTranslator.t("type.excerpt");
    },
    tag: "bg-tag-2-soft text-tag-2",
    icon: Highlighter,
  },
  "pdf-annotation": {
    get label() {
      return searchTranslator.t("type.pdf-annotation");
    },
    navKey: "pdfs",
    tag: "bg-tag-1-soft text-tag-1",
    icon: FileText,
  },
  "web-clip": {
    get label() {
      return searchTranslator.t("type.web-clip");
    },
    navKey: "projects",
    tag: "bg-tag-3-soft text-tag-3",
    icon: Globe,
  },
  // 插件自建的内容：类型名取插件声明，这里是兜底；不设范围 chip，只出现在「全部」
  "plugin-entity": {
    get label() {
      return searchTranslator.t("type.plugin-entity");
    },
    tag: "bg-tag-5-soft text-tag-5",
    icon: Puzzle,
  },
  todo: {
    get label() {
      return searchTranslator.t("type.todo");
    },
    navKey: "todos",
    tag: "bg-warn-soft text-warn",
    icon: ListTodo,
  },
  "calendar-event": {
    get label() {
      return searchTranslator.t("type.calendar-event");
    },
    navKey: "schedule",
    tag: "bg-info-soft text-info",
    icon: CalendarDays,
  },
  "document-task": {
    get label() {
      return searchTranslator.t("type.document-task");
    },
    navKey: "todos",
    tag: "bg-warn-soft text-warn",
    icon: ListTodo,
  },
  project: {
    get label() {
      return searchTranslator.t("type.project");
    },
    navKey: "projects",
    tag: "bg-tag-4-soft text-tag-4",
    icon: FolderKanban,
  },
  whiteboard: {
    get label() {
      return searchTranslator.t("type.whiteboard");
    },
    navKey: "whiteboard",
    tag: "bg-info-soft text-info",
    icon: Presentation,
  },
  notebook: {
    get label() {
      return searchTranslator.t("type.notebook");
    },
    navKey: "vibe-learning",
    tag: "bg-tag-2-soft text-tag-2",
    icon: FlaskConical,
  },
  pdf: {
    get label() {
      return searchTranslator.t("type.pdf");
    },
    navKey: "pdfs",
    tag: "bg-tag-1-soft text-tag-1",
    icon: BookOpen,
  },
  "chat-session": {
    get label() {
      return searchTranslator.t("type.chat-session");
    },
    navKey: "chat",
    tag: "bg-tag-3-soft text-tag-3",
    icon: MessageCircle,
  },
  database: {
    get label() {
      return searchTranslator.t("type.database");
    },
    navKey: "databases",
    tag: "bg-tag-4-soft text-tag-4",
    icon: Table,
  },
  flashcard: {
    get label() {
      return searchTranslator.t("type.flashcard");
    },
    navKey: "review",
    tag: "bg-ok-soft text-ok",
    icon: Repeat,
  },
};

/** 「摘录」一个范围覆盖三类外部材料 */
export type PaletteScope = ContentIndexType | CatalogSearchType | "material" | "cmd";

/** chips 行顺序：全部由空 scopes 集表达，不单列 */
export const SCOPE_ORDER: PaletteScope[] = [
  "card",
  "article",
  "project",
  "project-item",
  "diary-moment",
  "material",
  "todo",
  "calendar-event",
  "whiteboard",
  "notebook",
  "pdf",
  "chat-session",
  "database",
  "flashcard",
  "cmd",
];

/** 范围 → 检索的索引类型（命令范围不检索内容） */
export function scopeTypes(scope: PaletteScope): PaletteSearchType[] {
  if (scope === "cmd") return [];
  if (scope === "todo") return ["todo", "document-task"];
  return scope === "material" ? [...MATERIAL_KINDS] : [scope];
}

/** 结果类型归到哪个范围 chip（三类材料都算「摘录」）；插件内容没有 chip */
export function scopeOfType(type: PaletteSearchType): PaletteScope | null {
  if (type === "plugin-entity") return null;
  if (type === "document-task") return "todo";
  return isMaterialKind(type) ? "material" : type;
}

export function isCatalogSearchType(type: PaletteSearchType): type is CatalogSearchType {
  return CATALOG_SEARCH_TYPES.some(value => value === type);
}

export function scopeLabel(scope: PaletteScope): string {
  if (scope === "cmd") return searchTranslator.t("scope.cmd");
  return scope === "material" ? searchTranslator.t("scope.material") : CONTENT_TYPES[scope].label;
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
  /** 次行文案，缺省显示 section */
  sub?: string;
  icon: LucideIcon;
  /** 英文别名（小写包含匹配） */
  keywords?: string;
  kind: "page" | "action" | "plugin";
  run?: () => void | Promise<unknown>;
  pageKey?: string;
  action?:
    | "cycle-theme"
    | "open-settings"
    | "capture-todo"
    | "capture-event"
    | "toggle-assist"
    | "open-markdown"
    | "export-markdown"
    | "import-batch"
    | "export-perf-snapshot"
    | "send-feedback"
    | "capture-feedback";
}

let cached: PaletteCommand[] | null = null;

export function pluginPaletteCommands(
  host: Pick<PluginHost, "listCommands" | "executeCommand">
): PaletteCommand[] {
  return host.listCommands().map(command => ({
    id: `plugin:${command.id}`,
    label: command.title,
    get section() {
      return searchTranslator.t("section.plugin");
    },
    get sub() {
      return searchTranslator.t("plugin.from", { name: command.pluginName });
    },
    keywords: command.pluginName,
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
        get label() {
          return item.label;
        },
        get section() {
          return section.label;
        },
        icon: item.icon,
        kind: "page" as const,
        pageKey: item.key,
      }))
    ),
    ...NAV_FOOTER.map(item =>
      item.opensWindow === "feedback"
        ? {
            id: "action:send-feedback",
            get label() {
              return searchTranslator.t("command.send-feedback");
            },
            get section() {
              return searchTranslator.t("section.tools");
            },
            icon: item.icon,
            keywords: "feedback bug report issue suggest 反馈 问题 建议 报错 截图",
            kind: "action" as const,
            action: "send-feedback" as const,
          }
        : item.opensOverlay === "settings"
          ? {
              id: "action:open-settings",
              get label() {
                return item.label;
              },
              get section() {
                return searchTranslator.t("section.tools");
              },
              icon: item.icon,
              keywords: "settings preferences 设置 偏好 配置",
              kind: "action" as const,
              action: "open-settings" as const,
            }
          : {
              id: `page:${item.key}`,
              get label() {
                return item.label;
              },
              get section() {
                return searchTranslator.t("section.tools");
              },
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
            get label() {
              return searchTranslator.t("command.plugin-workbench");
            },
            get section() {
              return searchTranslator.t("section.dev");
            },
            icon: Command,
            keywords: "plugin 插件 开发 启用 停用",
            kind: "page" as const,
            pageKey: "plugin-workbench",
          },
        ]
      : []),
    {
      // 知识地图入口在标题栏，不在侧边栏
      id: "page:knowledge-map",
      get label() {
        return searchTranslator.t("command.knowledge-map");
      },
      get section() {
        return searchTranslator.t("section.knowledge");
      },
      icon: MapIcon,
      keywords: "map graph 图谱 地图 关联 主题",
      kind: "page",
      pageKey: "knowledge-map",
    },
    {
      id: "action:cycle-theme",
      get label() {
        return searchTranslator.t("command.cycle-theme");
      },
      get section() {
        return searchTranslator.t("section.action");
      },
      icon: SunMoon,
      keywords: "theme dark light 外观",
      kind: "action",
      action: "cycle-theme",
    },
    {
      id: "action:toggle-assist",
      get label() {
        return searchTranslator.t("command.toggle-assist");
      },
      get section() {
        return searchTranslator.t("section.action");
      },
      icon: MessageCircle,
      keywords: "ai chat assistant dock 对话 助手 停靠 ctrl+j",
      kind: "action",
      action: "toggle-assist",
    },
    {
      id: "action:capture-todo",
      get label() {
        return searchTranslator.t("command.capture-todo");
      },
      get section() {
        return searchTranslator.t("section.action");
      },
      icon: ListPlus,
      keywords: "todo task add 待办 任务 新建",
      kind: "action",
      action: "capture-todo",
    },
    {
      id: "action:capture-event",
      get label() {
        return searchTranslator.t("command.capture-event");
      },
      get section() {
        return searchTranslator.t("section.action");
      },
      icon: CalendarPlus,
      keywords: "event schedule calendar add 日程 日历 新建",
      kind: "action",
      action: "capture-event",
    },
    {
      id: "action:open-markdown",
      get label() {
        return searchTranslator.t("command.open-markdown");
      },
      get section() {
        return searchTranslator.t("section.action");
      },
      icon: FileDown,
      keywords: "markdown md open folder file 打开 本地 文件夹 typora",
      kind: "action",
      action: "open-markdown",
    },
    {
      id: "action:import-batch",
      get label() {
        return searchTranslator.t("command.import-batch");
      },
      get section() {
        return searchTranslator.t("section.action");
      },
      icon: FolderInput,
      keywords:
        "import folder zip markdown obsidian typora migrate 导入 批量 文件夹 压缩包 迁移 迁入 笔记",
      kind: "action",
      action: "import-batch",
    },
    {
      id: "action:export-markdown",
      get label() {
        return searchTranslator.t("command.export-markdown");
      },
      get section() {
        return searchTranslator.t("section.action");
      },
      icon: PackageOpen,
      keywords:
        "export zip markdown obsidian backup migrate 导出 打包 压缩包 备份 迁移 迁出 项目 文章 卡片 全部 资源 图片",
      kind: "action",
      action: "export-markdown",
    },
    {
      id: "action:export-perf-snapshot",
      get label() {
        return searchTranslator.t("command.export-perf-snapshot");
      },
      get section() {
        return searchTranslator.t("section.action");
      },
      icon: Activity,
      keywords: "perf performance lag jank snapshot diagnose 卡顿 性能 诊断 日志",
      kind: "action",
      action: "export-perf-snapshot",
    },
    {
      id: "action:capture-feedback",
      get label() {
        return searchTranslator.t("command.capture-feedback");
      },
      get section() {
        return searchTranslator.t("section.tools");
      },
      icon: Camera,
      keywords: "feedback screenshot capture bug report 反馈 截图 截屏 问题",
      kind: "action",
      action: "capture-feedback",
    },
  ];
  for (const command of cached) {
    const key = command.id.replace(/^(?:action|page):/, "command.");
    const label = command.pageKey ? getPageMeta(command.pageKey)?.label : undefined;
    const navKey =
      typeof label === "object" && label.kind === "i18n"
        ? label.key
        : command.id === "action:open-settings"
          ? "nav.settings"
          : undefined;
    const aliases = Object.values(searchMessages.resources)
      .map(resource => resource[key])
      .filter(Boolean);
    if (navKey)
      aliases.push(
        ...Object.values(appMessages.resources)
          .map(resource => resource[navKey])
          .filter(Boolean)
      );
    command.keywords = [command.keywords, command.id, ...aliases].filter(Boolean).join(" ");
  }
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
