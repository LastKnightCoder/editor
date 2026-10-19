/** 侧栏条目，摘自 apps/desktop/src/app/navigation.ts（NAV_SECTIONS / NAV_FOOTER）；badge 为演示数字 */
import {
  BookMarked,
  Blocks,
  Calendar,
  CircleHelp,
  FileText,
  Flame,
  FlaskConical,
  FolderKanban,
  Footprints,
  Layers,
  ListTodo,
  MessageCircle,
  PenLine,
  Plug,
  Presentation,
  Repeat,
  Send,
  SlidersHorizontal,
  Sparkles,
  Table,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";

/** badge：review = 实心 accent 计数（ReviewDueBadge），muted = 淡墨计数（QuestionsNavBadge） */
export type NavItem = { key: string; label: string; icon: LucideIcon; badge?: { tone: "review" | "muted"; count: number } };

export const NAV_SECTIONS = [
  {
    label: "日常",
    items: [
      { key: "home", label: "今日", icon: Flame },
      { key: "schedule", label: "日程", icon: Calendar },
      { key: "todos", label: "待办", icon: ListTodo },
      { key: "diary", label: "日记", icon: PenLine },
      { key: "pomodoro", label: "番茄专注", icon: Timer },
    ],
  },
  {
    label: "知识",
    items: [
      { key: "cards", label: "卡片库", icon: Layers },
      { key: "articles", label: "文章", icon: FileText },
      { key: "projects", label: "项目", icon: FolderKanban },
      { key: "whiteboard", label: "白板", icon: Presentation },
      { key: "databases", label: "数据库", icon: Table },
    ],
  },
  {
    label: "学习",
    items: [
      { key: "questions", label: "问题管理", icon: CircleHelp, badge: { tone: "muted", count: 3 } },
      { key: "vibe-learning", label: "Notebook", icon: FlaskConical },
      { key: "pdfs", label: "PDF", icon: BookMarked },
      { key: "walk", label: "漫步", icon: Footprints },
      { key: "review", label: "闪卡复习", icon: Repeat, badge: { tone: "review", count: 12 } },
    ],
  },
  {
    label: "AI",
    items: [
      { key: "chat", label: "AI 对话", icon: MessageCircle },
      { key: "skills", label: "Skill", icon: Sparkles },
      { key: "mcp", label: "MCP 服务器", icon: Plug },
    ],
  },
  {
    label: "分享",
    items: [
      { key: "collaboration", label: "协作", icon: Users },
      { key: "publish", label: "发布", icon: Send },
    ],
  },
] as const satisfies readonly { label: string; items: readonly NavItem[] }[];

export const NAV_FOOTER = [
  { key: "plugins", label: "插件", icon: Blocks },
  { key: "settings", label: "设置", icon: SlidersHorizontal },
] as const satisfies readonly NavItem[];

export type NavKey =
  | (typeof NAV_SECTIONS)[number]["items"][number]["key"]
  | (typeof NAV_FOOTER)[number]["key"]
  | "card-detail"
  | "knowledge-map"
  /** 插件贡献的页面（如微信读书） */
  | `plugin:${string}`;
