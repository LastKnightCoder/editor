import { appTranslator } from "./i18n/messages";
/**
 * 侧边栏模块清单 —— 真实信息架构（数据驱动，Sidebar 只负责渲染）。
 *
 * key 与 features/<域>/pages/*.page.tsx 的 definePage key 一一对应（占位注册已随全部
 * 模块迁入真实 page 退役）。修改本文件即修改侧边栏——不要在 Sidebar 组件里硬编码条目。
 *
 * 项目即文档树；数据库（数据表格）与 Notebook（原 Vibe Learning）各为独立顶级模块。
 * 分组按「它是什么」划分（日常 / 知识 / 学习 / AI / 分享），用途差异在页面内部表达。
 *
 * 图标：lucide-react（线性单色）；多色图标用 react-icons（桌面已有依赖）。
 */

import {
  Flame,
  Layers,
  FileText,
  BookMarked,
  Footprints,
  Presentation,
  PenLine,
  Repeat,
  Calendar,
  ListTodo,
  Timer,
  FolderKanban,
  Table,
  Send,
  MessageCircle,
  Sparkles,
  Plug,
  Blocks,
  FlaskConical,
  Users,
  SlidersHorizontal,
  MessageSquareHeart,
  type LucideIcon,
} from "lucide-react";
import { SIDEBAR_GROUPS, type PluginSidebarIcon } from "@tau/plugins";
import type { PluginSidebarSnapshot } from "./plugins/runtime";
import { ALWAYS_ON_FEATURES } from "./features";

/** 徽标槽 key（渲染组件注册于 navSlots.tsx） */
export type NavItemBadge =
  | "review-due"
  | "pomodoro-live"
  | "collab-requests"
  | "mcp-errors"
  | "plugin-status";
/** 子项槽 key：所属页在栈顶时于条目下方展开的列表（渲染组件注册于 navSlots.tsx） */
export type NavItemChildren =
  | "collaboration-sessions"
  | "todo-groups"
  | "card-tags"
  | "article-tags"
  | "diary-tags"
  | "whiteboard-tags"
  | "chat-sessions";

export interface NavItem<Icon = PluginSidebarIcon> {
  key: string;
  label: string;
  icon: Icon;
  /** 徽标数据源标识（review-due = 待复习闪卡数；pomodoro-live = 专注中的实时计时；
   *  collab-requests = 待审批的加入申请数；mcp-errors = 连接失败的 MCP 服务器数；
   *  plugin-status = 等待授权的插件数 + 可更新的插件数） */
  badge?: NavItemBadge;
  /** 该页在栈顶时于条目下方展开的子项（collaboration-sessions = 共享内容列表，协作页；
   *  todo-groups = 待办项目；card-tags = 卡片标签树（限高滚动）；article-tags = 文章标签（限高滚动）；diary-tags = 日记标签频道；whiteboard-tags = 白板标签；chat-sessions = 置顶与最近 AI 会话） */
  children?: NavItemChildren;
  /** 不导航页面、打开壳层浮层的入口（当前仅设置弹窗） */
  opensOverlay?: "settings";
  /** 不导航页面、打开独立窗口的入口（反馈窗口：可边操作主窗口边截图） */
  opensWindow?: "feedback";
  plugin?: PluginSidebarSnapshot["items"][number];
}

export interface NavSection<Icon = PluginSidebarIcon> {
  id: string;
  label: string;
  collapseKey?: string;
  items: NavItem<Icon>[];
}

export const NAV_SECTIONS: NavSection<LucideIcon>[] = [
  {
    // 以「天」为单位的日常：今日 = 行动（复习/待办/日程）+ 继续 + 回顾；日记按天记录，同属时间轴
    id: SIDEBAR_GROUPS.daily,
    collapseKey: "日常",
    get label() {
      return appTranslator.t("nav.group.daily");
    },
    items: [
      {
        key: "home",
        get label() {
          return appTranslator.t("nav.home");
        },
        icon: Flame,
      },
      {
        key: "schedule",
        get label() {
          return appTranslator.t("nav.schedule");
        },
        icon: Calendar,
      },
      {
        key: "todos",
        get label() {
          return appTranslator.t("nav.todos");
        },
        icon: ListTodo,
        children: "todo-groups",
      }, // features/todos（独立页，不并入 schedule；项目嵌在此入口下）
      {
        key: "diary",
        get label() {
          return appTranslator.t("nav.diary");
        },
        icon: PenLine,
        children: "diary-tags",
      }, // features/diary（一整张纸，标签频道嵌在此入口下）
      {
        key: "pomodoro",
        get label() {
          return appTranslator.t("nav.pomodoro");
        },
        icon: Timer,
        badge: "pomodoro-live",
      }, // features/pomodoro（独立页；小窗与沉浸为辅助窗口）
    ],
  },
  {
    // 有体系的产出：卡片（原子）→ 文章（长文）→ 项目（体系梳理）→ 其他形态
    id: SIDEBAR_GROUPS.knowledge,
    collapseKey: "知识",
    get label() {
      return appTranslator.t("nav.group.knowledge");
    },
    items: [
      {
        key: "cards",
        get label() {
          return appTranslator.t("nav.cards");
        },
        icon: Layers,
        children: "card-tags",
      }, // features/cards（一整张纸，标签树嵌在此入口下）
      {
        key: "articles",
        get label() {
          return appTranslator.t("nav.articles");
        },
        icon: FileText,
        children: "article-tags",
      }, // features/articles（一整张纸，标签嵌在此入口下）
      {
        key: "projects",
        get label() {
          return appTranslator.t("nav.projects");
        },
        icon: FolderKanban,
      }, // features/projects（驾驶舱列表 + 文档树工作台）
      {
        key: "whiteboard",
        get label() {
          return appTranslator.t("nav.whiteboard");
        },
        icon: Presentation,
        children: "whiteboard-tags",
      }, // features/whiteboards（画廊，标签嵌在此入口下）
      {
        key: "databases",
        get label() {
          return appTranslator.t("nav.databases");
        },
        icon: Table,
      }, // features/databases（结构化数据表，自项目 data-table 型拆出）
    ],
  },
  {
    // 学习工作流：问题（起点）→ 学习形式与资料 → 闪卡巩固
    id: SIDEBAR_GROUPS.learning,
    collapseKey: "学习",
    get label() {
      return appTranslator.t("nav.group.learning");
    },
    items: [
      {
        key: "vibe-learning",
        get label() {
          return appTranslator.t("nav.vibe-learning");
        },
        icon: FlaskConical,
      }, // features/vibe-learning（对外名 Notebook——仿 NotebookLM；自项目 vibe-learning 型拆出，标识符跟数据库走不改名）
      {
        key: "pdfs",
        get label() {
          return appTranslator.t("nav.pdfs");
        },
        icon: BookMarked,
      }, // features/pdfs（文档墙 + 列表排布）
      {
        key: "walk",
        get label() {
          return appTranslator.t("nav.walk");
        },
        icon: Footprints,
      }, // features/walk（随机抽旧内容重温，顺岔路走到相邻内容）
      {
        key: "review",
        get label() {
          return appTranslator.t("nav.review");
        },
        icon: Repeat,
        badge: "review-due",
      }, // features/flashcards（复习台）
    ],
  },
  {
    id: SIDEBAR_GROUPS.ai,
    collapseKey: "AI",
    get label() {
      return appTranslator.t("nav.group.ai");
    },
    items: [
      {
        key: "chat",
        get label() {
          return appTranslator.t("nav.chat");
        },
        icon: MessageCircle,
        children: "chat-sessions",
      }, // 会话导航嵌在侧栏入口下
      {
        key: "skills",
        get label() {
          return appTranslator.t("nav.skills");
        },
        icon: Sparkles,
      }, // features/skills（卡片库 + 抽屉 + 整页编辑）
      {
        key: "mcp",
        get label() {
          return appTranslator.t("nav.mcp");
        },
        icon: Plug,
        badge: "mcp-errors",
      }, // features/mcp（连接失败数作徽标）
    ],
  },
  {
    // 对外：实时协作 → 静态发布
    id: SIDEBAR_GROUPS.sharing,
    collapseKey: "分享",
    get label() {
      return appTranslator.t("nav.group.sharing");
    },
    items: [
      {
        key: "collaboration",
        get label() {
          return appTranslator.t("nav.collaboration");
        },
        icon: Users,
        badge: "collab-requests",
        children: "collaboration-sessions",
      }, // features/collaboration（共享内容作为子项嵌套在此入口下）
      {
        key: "publish",
        get label() {
          return appTranslator.t("nav.publish");
        },
        icon: Send,
      }, // 新架构：静态站点发布（自设置弹窗抽出）
    ],
  },
];

export const NAV_FOOTER: NavItem<LucideIcon>[] = [
  // 设置入口打开壳层设置弹窗（legacy 全屏设置页已随第三批清理退役）
  // 插件中心与已安装管理；插件设置在详情页，设置弹窗只留跳转
  {
    key: "plugins",
    get label() {
      return appTranslator.t("nav.plugins");
    },
    icon: Blocks,
    badge: "plugin-status",
  },
  {
    key: "feedback",
    get label() {
      return appTranslator.t("nav.feedback");
    },
    icon: MessageSquareHeart,
    opensWindow: "feedback",
  },
  {
    key: "settings",
    get label() {
      return appTranslator.t("nav.settings");
    },
    icon: SlidersHorizontal,
    opensOverlay: "settings",
  },
];

/** 可在设置 › 功能里开关的内置条目 key（今日始终显示） */
export const TOGGLEABLE_NAV_KEYS: readonly string[] = NAV_SECTIONS.flatMap(section =>
  section.items.map(item => item.key)
).filter(key => !ALWAYS_ON_FEATURES.has(key));

/** 按功能开关过滤内置条目；整组都被关掉的分组不显示 */
export function enabledNavSections(isEnabled: (key: string) => boolean): NavSection<LucideIcon>[] {
  return NAV_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item => isEnabled(item.key)),
  })).filter(section => section.items.length > 0);
}

export function composeNavSections(
  snapshot?: PluginSidebarSnapshot,
  isEnabled: (key: string) => boolean = () => true
): NavSection[] {
  const builtins = enabledNavSections(isEnabled);
  if (!snapshot) return builtins;
  const sections: NavSection[] = builtins.map(section => ({
    ...section,
    items: [...section.items],
  }));
  for (const group of snapshot.groups) {
    sections.push({
      id: group.id,
      label: group.title,
      collapseKey: group.id,
      items: [],
    });
  }
  const fallback: NavSection = {
    id: SIDEBAR_GROUPS.plugins,
    label: "插件",
    collapseKey: "plugins",
    items: [],
  };
  sections.push(fallback);
  for (const item of snapshot.items) {
    const section = sections.find(section => section.id === item.group) ?? fallback;
    section.items.push({
      key: item.id,
      label: item.title,
      icon: item.icon ?? Plug,
      plugin: item,
    });
  }
  return sections.filter(section => section.items.length > 0);
}

export function isNavItemActive(
  item: NavItem,
  current?: { key: string; params: Record<string, unknown> }
): boolean {
  if (!item.plugin) return item.key === current?.key;
  return (
    current?.key === "plugin-page" &&
    current.params.pluginId === item.plugin.pluginId &&
    current.params.pageId === item.plugin.pageId &&
    current.params.instanceId === item.plugin.instanceId
  );
}
