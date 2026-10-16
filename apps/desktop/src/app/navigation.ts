/**
 * 侧边栏模块清单 —— 真实信息架构（数据驱动，Sidebar 只负责渲染）。
 *
 * key 与 features/<域>/pages/*.page.tsx 的 definePage key 一一对应（占位注册已随全部
 * 模块迁入真实 page 退役）。修改本文件即修改侧边栏——不要在 Sidebar 组件里硬编码条目。
 *
 * 项目即文档树；数据库（数据表格）与 Notebook（原 Vibe Learning）自 2026-09-28 起各为独立顶级模块。
 * 分组按「它是什么」划分（日常 / 知识 / 学习 / AI / 分享，D-071），用途差异在页面内部表达。
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
  CircleHelp,
  FolderKanban,
  Table,
  Send,
  MessageCircle,
  Sparkles,
  Plug,
  FlaskConical,
  Users,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { SIDEBAR_GROUPS, type PluginSidebarIcon } from "@tau/plugins";
import type { PluginSidebarSnapshot } from "./plugins/runtime";

/** 徽标槽 key（渲染组件注册于 navSlots.tsx） */
export type NavItemBadge =
  "review-due" | "pomodoro-live" | "collab-requests" | "questions-active" | "mcp-errors";
/** 子项槽 key：所属页在栈顶时于条目下方展开的列表（渲染组件注册于 navSlots.tsx） */
export type NavItemChildren =
  | "collaboration-sessions"
  | "todo-groups"
  | "card-tags"
  | "article-tags"
  | "diary-tags"
  | "whiteboard-tags"
  | "question-groups"
  | "chat-sessions";

export interface NavItem<Icon = PluginSidebarIcon> {
  key: string;
  label: string;
  icon: Icon;
  /** 徽标数据源标识（review-due = 待复习闪卡数；pomodoro-live = 专注中的实时计时；
   *  collab-requests = 待审批的加入申请数；mcp-errors = 连接失败的 MCP 服务器数） */
  badge?: NavItemBadge;
  /** 该页在栈顶时于条目下方展开的子项（collaboration-sessions = 共享内容列表，协作页 A3；
   *  todo-groups = 待办项目；card-tags = 卡片标签树（限高滚动）；article-tags = 文章标签（限高滚动）；diary-tags = 日记标签频道，D-044；whiteboard-tags = 白板标签，D-047；question-groups = 问题分组；chat-sessions = 置顶与最近 AI 会话） */
  children?: NavItemChildren;
  /** 不导航页面、打开壳层浮层的入口（当前仅设置弹窗，D-028） */
  opensOverlay?: "settings";
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
    // 以「天」为单位的日常：今日 = 行动（复习/待办/日程）+ 继续 + 回顾；日记按天记录，同属时间轴（D-071）
    id: SIDEBAR_GROUPS.daily,
    label: "日常",
    items: [
      { key: "home", label: "今日", icon: Flame },
      { key: "schedule", label: "日程", icon: Calendar },
      { key: "todos", label: "待办", icon: ListTodo, children: "todo-groups" }, // features/todos（独立页，不并入 schedule，D-040；项目嵌在此入口下）
      { key: "diary", label: "日记", icon: PenLine, children: "diary-tags" }, // features/diary（一整张纸，标签频道嵌在此入口下，D-044）
      { key: "pomodoro", label: "番茄专注", icon: Timer, badge: "pomodoro-live" }, // features/pomodoro（独立页；小窗与沉浸为辅助窗口）
    ],
  },
  {
    // 有体系的产出：卡片（原子）→ 文章（长文）→ 项目（体系梳理）→ 其他形态
    id: SIDEBAR_GROUPS.knowledge,
    label: "知识",
    items: [
      { key: "cards", label: "卡片库", icon: Layers, children: "card-tags" }, // features/cards（一整张纸，标签树嵌在此入口下）
      { key: "articles", label: "文章", icon: FileText, children: "article-tags" }, // features/articles（一整张纸，标签嵌在此入口下）
      { key: "projects", label: "项目", icon: FolderKanban }, // features/projects（驾驶舱列表 + 文档树工作台）
      { key: "whiteboard", label: "白板", icon: Presentation, children: "whiteboard-tags" }, // features/whiteboards（画廊，标签嵌在此入口下，D-047）
      { key: "databases", label: "数据库", icon: Table }, // features/databases（结构化数据表，2026-09-28 自项目 data-table 型拆出）
    ],
  },
  {
    // 学习工作流：问题（起点）→ 学习形式与资料 → 闪卡巩固
    id: SIDEBAR_GROUPS.learning,
    label: "学习",
    items: [
      {
        key: "questions",
        label: "问题管理",
        icon: CircleHelp,
        badge: "questions-active",
        children: "question-groups",
      }, // 问题分组嵌在侧栏入口下（D-089）
      { key: "vibe-learning", label: "Notebook", icon: FlaskConical }, // features/vibe-learning（对外名 Notebook——仿 NotebookLM；2026-09-28 自项目 vibe-learning 型拆出，标识符跟数据库走不改名）
      { key: "pdfs", label: "PDF", icon: BookMarked }, // features/pdfs（文档墙 + 列表排布，D-069）
      { key: "walk", label: "漫步", icon: Footprints }, // features/walk（随机抽旧内容重温，顺岔路走到相邻内容）
      { key: "review", label: "闪卡复习", icon: Repeat, badge: "review-due" }, // features/flashcards（复习台，D-041）
    ],
  },
  {
    id: SIDEBAR_GROUPS.ai,
    label: "AI",
    items: [
      { key: "chat", label: "AI 对话", icon: MessageCircle, children: "chat-sessions" }, // 会话导航嵌在侧栏入口下
      { key: "skills", label: "Skill", icon: Sparkles }, // features/skills（卡片库 + 抽屉 + 整页编辑，D-060）
      { key: "mcp", label: "MCP 服务器", icon: Plug, badge: "mcp-errors" }, // features/mcp（连接失败数作徽标）
    ],
  },
  {
    // 对外：实时协作 → 静态发布
    id: SIDEBAR_GROUPS.sharing,
    label: "分享",
    items: [
      {
        key: "collaboration",
        label: "协作",
        icon: Users,
        badge: "collab-requests",
        children: "collaboration-sessions",
      }, // features/collaboration（共享内容作为子项嵌套在此入口下）
      { key: "publish", label: "发布", icon: Send }, // 新架构：静态站点发布（自设置弹窗抽出，D-035）
    ],
  },
];

export const NAV_FOOTER: NavItem<LucideIcon>[] = [
  // 设置入口打开壳层设置弹窗（D-028；legacy 全屏设置页已随 2026-09-29 第三批清理退役）
  { key: "settings", label: "设置", icon: SlidersHorizontal, opensOverlay: "settings" },
];

export function composeNavSections(snapshot?: PluginSidebarSnapshot): NavSection[] {
  if (!snapshot) return NAV_SECTIONS;
  const sections: NavSection[] = NAV_SECTIONS.map(section => ({
    ...section,
    items: [...section.items],
  }));
  for (const group of snapshot.groups) {
    sections.push({ id: group.id, label: group.title, collapseKey: group.id, items: [] });
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
    section.items.push({ key: item.id, label: item.title, icon: item.icon ?? Plug, plugin: item });
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
