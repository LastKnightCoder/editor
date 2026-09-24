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
  Inbox,
  FolderKanban,
  BarChart3,
  Send,
  MessageCircle,
  Sparkles,
  Users,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  /** 徽标数据源标识（后续接 query：如闪卡到期数） */
  badge?: "review-due";
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
      { key: "todos", label: "待办", icon: ListTodo }, // legacy: Todo（蓝图 §5.3 未裁决归属，M1 映射时定是否并入 schedule）
      { key: "pomodoro", label: "番茄专注", icon: Timer }, // legacy: Pomodoro（域归 schedule，独立小窗口保留，蓝图 §5.3）
      { key: "collaboration", label: "协作", icon: Users }, // legacy: CollaborationView（实时协作会话）
    ],
  },
  {
    label: "知识",
    items: [
      { key: "cards", label: "卡片库", icon: Layers }, // features/cards
      { key: "articles", label: "文章", icon: FileText }, // legacy: ArticleListView
      { key: "diary", label: "日记", icon: PenLine }, // legacy: DiaryView（TabType.DailyNote）
      { key: "whiteboard", label: "白板", icon: Presentation }, // legacy: WhiteBoardView
    ],
  },
  {
    label: "学习",
    items: [
      // 项目即学习容器（文档树/数据表格/Vibe Learning 三型皆学习导向），归学习组
      { key: "projects", label: "项目", icon: FolderKanban }, // legacy: ProjectListView（VibeLearning 详情即学习工作台）
      { key: "review", label: "闪卡复习", icon: Repeat, badge: "review-due" }, // legacy: FlashcardCenter（与 VibeLearning 同归 learning 域，蓝图 §5.3）
      { key: "questions", label: "问题管理", icon: CircleHelp }, // legacy: QuestionWindowPage
      { key: "weread", label: "微信读书", icon: BookOpen }, // legacy: WeRead
      { key: "feed", label: "订阅", icon: Inbox }, // legacy: FeedView（RSS / 稍后读）
    ],
  },
  {
    label: "AI",
    items: [
      { key: "chat", label: "AI 对话", icon: MessageCircle }, // legacy: ChatSidebar（将迁出布局层归位 feature）
      { key: "skills", label: "Skill 管理", icon: Sparkles }, // legacy: SkillManagement
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
