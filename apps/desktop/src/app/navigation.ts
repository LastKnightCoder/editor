/**
 * 侧边栏模块清单 —— 真实信息架构（数据驱动，Sidebar 只负责渲染）。
 *
 * key 与 features/<域>/pages/*.page.tsx 的 definePage key 一一对应；
 * status 标注迁移进度（蓝图 §5.1），legacy 模块点击后由 LegacyPendingPage 过渡展示。
 * 修改本文件即修改侧边栏——不要在 Sidebar 组件里硬编码条目。
 *
 * 文档树统一由项目承载；VibeLearning 学习项目也由项目详情承载。
 *
 * 图标：lucide-react（线性单色）；多色图标用 react-icons（桌面已有依赖）。
 */

import {
  Flame,
  Layers,
  FileText,
  BookOpen,
  Presentation,
  PenLine,
  Repeat,
  Calendar,
  ListTodo,
  Timer,
  CircleHelp,
  FolderKanban,
  BarChart3,
  Send,
  MessageCircle,
  Sparkles,
  Plug,
  Users,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

/** 徽标槽 key（渲染组件注册于 navSlots.tsx） */
export type NavItemBadge =
  "review-due" | "pomodoro-live" | "collab-requests" | "questions-active" | "mcp-errors";
/** 子项槽 key：所属页在栈顶时于条目下方展开的列表（渲染组件注册于 navSlots.tsx） */
export type NavItemChildren =
  | "collaboration-sessions"
  | "todo-groups"
  | "project-types"
  | "diary-tags"
  | "whiteboard-tags"
  | "question-groups"
  | "chat-sessions";

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  /** 徽标数据源标识（review-due = 待复习闪卡数；pomodoro-live = 专注中的实时计时；
   *  collab-requests = 待审批的加入申请数；mcp-errors = 连接失败的 MCP 服务器数） */
  badge?: NavItemBadge;
  /** 该页在栈顶时于条目下方展开的子项（collaboration-sessions = 共享内容列表，协作页 A3；
   *  todo-groups = 待办项目；project-types = 项目类型；diary-tags = 日记标签频道，D-044；whiteboard-tags = 白板标签，D-047；question-groups = 问题分组；chat-sessions = 置顶与最近 AI 会话，D-047） */
  children?: NavItemChildren;
  /** 不导航页面、打开壳层浮层的入口（当前仅设置弹窗，D-028） */
  opensOverlay?: "settings";
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    // 今日的 hero 与行动三卡（专注/待办/日程）即此组的工作流闭环；协作是多人实时会话，属日常工作流
    label: "工作台",
    items: [
      { key: "home", label: "今日", icon: Flame },
      { key: "schedule", label: "日程", icon: Calendar }, // legacy: Calendar + TimeRecordView
      { key: "todos", label: "待办", icon: ListTodo, children: "todo-groups" }, // features/todos（独立页，不并入 schedule，D-040；项目嵌在此入口下）
      { key: "pomodoro", label: "番茄专注", icon: Timer, badge: "pomodoro-live" }, // features/pomodoro（独立页；小窗与沉浸为辅助窗口）
      {
        key: "collaboration",
        label: "协作",
        icon: Users,
        badge: "collab-requests",
        children: "collaboration-sessions",
      }, // features/collaboration（共享内容作为子项嵌套在此入口下）
    ],
  },
  {
    label: "知识",
    items: [
      { key: "cards", label: "卡片库", icon: Layers }, // features/cards
      { key: "articles", label: "文章", icon: FileText }, // legacy: ArticleListView
      { key: "diary", label: "日记", icon: PenLine, children: "diary-tags" }, // features/diary（一整张纸，标签频道嵌在此入口下，D-044）
      { key: "whiteboard", label: "白板", icon: Presentation, children: "whiteboard-tags" }, // features/whiteboards（画廊，标签嵌在此入口下，D-047）
    ],
  },
  {
    label: "学习",
    items: [
      // 项目即学习容器（文档树/数据表格/Vibe Learning 三型皆学习导向），归学习组
      { key: "projects", label: "项目", icon: FolderKanban, children: "project-types" }, // features/projects（学习驾驶舱 + 三型详情工作台；类型嵌在此入口下）
      { key: "review", label: "闪卡复习", icon: Repeat, badge: "review-due" }, // features/flashcards（复习台，D-041）
      {
        key: "questions",
        label: "问题管理",
        icon: CircleHelp,
        badge: "questions-active",
        children: "question-groups",
      }, // features/questions（A2 三栏清单，D-044；分组嵌在此入口下）
      { key: "weread", label: "微信读书", icon: BookOpen }, // features/weread（书架 + 整页笔记，D-059）
    ],
  },
  {
    label: "AI",
    items: [
      { key: "chat", label: "AI 对话", icon: MessageCircle, children: "chat-sessions" }, // features/chat（会话嵌侧栏 + 右侧停靠栏，D-047）
      { key: "skills", label: "Skill", icon: Sparkles }, // features/skills（卡片库 + 抽屉 + 整页编辑，D-060）
      { key: "mcp", label: "MCP 服务器", icon: Plug, badge: "mcp-errors" }, // features/mcp（连接失败数作徽标）
    ],
  },
  {
    label: "工具",
    items: [
      { key: "stats", label: "统计", icon: BarChart3 }, // 新架构：数据回顾页
      { key: "publish", label: "发布", icon: Send }, // 新架构：静态站点发布（自设置弹窗抽出，D-035）
    ],
  },
];

export const NAV_FOOTER: NavItem[] = [
  // legacy 全屏设置页仍走 TabType.Settings（/legacy 侧）；新壳层入口打开设置弹窗（D-028）
  { key: "settings", label: "设置", icon: SlidersHorizontal, opensOverlay: "settings" },
];
