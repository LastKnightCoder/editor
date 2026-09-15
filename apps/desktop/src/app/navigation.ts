/**
 * 侧边栏模块清单 —— 真实信息架构（数据驱动，Sidebar 只负责渲染）。
 *
 * key 与 features/<域>/surfaces/*.surface.tsx 的 defineSurface key 一一对应；
 * status 标注迁移进度（蓝图 §5.1），legacy 模块点击后由 LegacyPendingSurface 过渡展示。
 * 修改本文件即修改侧边栏——不要在 Sidebar 组件里硬编码条目。
 *
 * 图标：lucide-react（线性单色）；多色图标用 react-icons（桌面已有依赖）。
 */

import {
  Flame,
  Layers,
  FileText,
  Book,
  BookOpen,
  Presentation,
  PenLine,
  GraduationCap,
  Repeat,
  Calendar,
  Inbox,
  Folder,
  BarChart3,
  MessageCircle,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  /** 徽标数据源标识（后续接 query：如闪卡到期数） */
  badge?: "review-due";
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "工作台",
    items: [{ key: "home", label: "今日", icon: Flame }],
  },
  {
    label: "知识",
    items: [
      { key: "cards", label: "卡片库", icon: Layers }, // legacy: card-list-view
      { key: "articles", label: "文章", icon: FileText }, // legacy: ArticleListView
      { key: "library", label: "知识库", icon: Book }, // legacy: DocumentsView + PdfView + VecDocumentView（合并目标）
      { key: "whiteboard", label: "白板", icon: Presentation }, // legacy: WhiteBoardView
      { key: "diary", label: "日记", icon: PenLine }, // legacy: DiaryView（TabType.DailyNote）
    ],
  },
  {
    label: "学习",
    items: [
      { key: "learning", label: "学习资料", icon: GraduationCap }, // legacy: VibeLearningView
      { key: "review", label: "闪卡复习", icon: Repeat, badge: "review-due" }, // legacy: FlashcardCenter
    ],
  },
  {
    label: "工具",
    items: [
      { key: "schedule", label: "日程", icon: Calendar }, // legacy: Calendar + TimeRecordView
      { key: "feed", label: "订阅", icon: Inbox }, // legacy: FeedView（RSS / 稍后读）
      { key: "weread", label: "微信读书", icon: BookOpen }, // legacy: WeRead
      { key: "resources", label: "资源管理", icon: Folder }, // legacy: ResourceManagement
      { key: "stats", label: "统计", icon: BarChart3 }, // 新架构：数据回顾页
    ],
  },
];

export const NAV_FOOTER: NavItem[] = [
  { key: "chat", label: "AI 对话", icon: MessageCircle }, // legacy: ChatSidebar（将迁出布局层归位 feature）
  { key: "settings", label: "设置", icon: SlidersHorizontal }, // legacy: Settings（15 子页拆解）
];
