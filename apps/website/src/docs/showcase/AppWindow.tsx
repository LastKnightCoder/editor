/**
 * 示意画面的窗口外壳：侧栏条目与标题栏按桌面端 app/Sidebar.tsx、Titlebar.tsx 的结构重建，
 * 条目数据与 app/navigation.ts 一致。只做展示，点击侧栏不跳转。
 */
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  BookMarked,
  Calendar,
  ChevronDown,
  ChevronsLeft,
  FileText,
  Flame,
  FlaskConical,
  FolderKanban,
  Footprints,
  Layers,
  ListTodo,
  Map as MapIcon,
  MessageCircle,
  MessageSquareHeart,
  PenLine,
  Plug,
  Presentation,
  Repeat,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Table,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@tau/ui";

export type NavKey =
  | "home"
  | "schedule"
  | "todos"
  | "diary"
  | "pomodoro"
  | "cards"
  | "articles"
  | "projects"
  | "whiteboard"
  | "databases"
  | "vibe-learning"
  | "pdfs"
  | "walk"
  | "review"
  | "chat"
  | "skills"
  | "mcp"
  | "collaboration"
  | "publish"
  | "plugins"
  | "feedback"
  | "settings";

interface NavItem {
  key: NavKey;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
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
      { key: "vibe-learning", label: "Notebook", icon: FlaskConical },
      { key: "pdfs", label: "PDF", icon: BookMarked },
      { key: "walk", label: "漫步", icon: Footprints },
      { key: "review", label: "闪卡复习", icon: Repeat, badge: 12 },
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
];

const NAV_FOOTER: NavItem[] = [
  { key: "plugins", label: "插件", icon: Blocks },
  { key: "feedback", label: "反馈", icon: MessageSquareHeart },
  { key: "settings", label: "设置", icon: SlidersHorizontal },
];

function NavRow({ item, active, rail }: { item: NavItem; active: boolean; rail: boolean }) {
  const Icon = item.icon;
  return (
    <div
      title={item.label}
      className={cn(
        "text-tau-body relative flex h-[calc(1.65em+8px)] w-full items-center rounded-[10px]",
        rail ? "justify-center" : "gap-2.5 px-2.5",
        active
          ? cn(
              "bg-selected text-ink-1 before:bg-accent font-medium before:absolute before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-[3px] before:content-['']",
              rail ? "before:-left-3" : "before:-left-2.5"
            )
          : "text-ink-2"
      )}
    >
      <Icon className="shrink-0" size="1.06em" strokeWidth={1.75} aria-hidden="true" />
      {!rail && <span className="min-w-0 truncate">{item.label}</span>}
      {!rail && item.badge ? (
        <span className="bg-accent text-ink-inverse text-tau-micro ml-auto rounded-full px-1.5 leading-[18px] tabular-nums">
          {item.badge}
        </span>
      ) : null}
    </div>
  );
}

function TrafficLights() {
  return (
    <span className="flex items-center gap-2" aria-hidden="true">
      {/* 系统窗口按钮的固有颜色，与主题无关 */}
      <i className="size-3 rounded-full bg-[#ff5f57]" />
      <i className="size-3 rounded-full bg-[#febc2e]" />
      <i className="size-3 rounded-full bg-[#28c840]" />
    </span>
  );
}

function Sidebar({ active, rail }: { active?: NavKey; rail: boolean }) {
  return (
    <nav
      aria-hidden="true"
      className={cn("flex shrink-0 flex-col pb-3", rail ? "w-[58px] px-2" : "w-[200px] px-2.5")}
    >
      <div
        className={cn(
          "flex h-[46px] shrink-0 items-center gap-2",
          rail ? "justify-center" : "mb-1.5 px-1.5"
        )}
      >
        <TrafficLights />
        {!rail && <ChevronsLeft className="text-ink-3 ml-auto" size={16} strokeWidth={1.75} />}
      </div>
      <div className="scrollbar-hide min-h-0 flex-1 overflow-hidden">
        {NAV_SECTIONS.map((section, index) => (
          <div key={section.label} className={cn(rail && index === 0 ? "mt-0" : "mt-3")}>
            {!rail && (
              <div className="text-tau-tiny text-ink-3 flex items-center gap-1 px-2.5 pb-1.5">
                <ChevronDown size="1em" strokeWidth={1.75} />
                {section.label}
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map(item => (
                <NavRow key={item.key} item={item} active={item.key === active} rail={rail} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-line-1 mt-2 space-y-0.5 border-t pt-2">
        {NAV_FOOTER.map(item => (
          <NavRow key={item.key} item={item} active={item.key === active} rail={rail} />
        ))}
      </div>
    </nav>
  );
}

function TitleIcon({ icon: Icon, on }: { icon: LucideIcon; on?: boolean }) {
  return (
    <span
      className={cn(
        "grid size-[28px] place-items-center rounded-[8px]",
        on ? "bg-selected text-accent-text" : "text-ink-2"
      )}
    >
      <Icon size={17} strokeWidth={1.75} />
    </span>
  );
}

function Titlebar({ crumb, assistOn }: { crumb?: ReactNode; assistOn?: boolean }) {
  return (
    <header aria-hidden="true" className="flex h-[46px] items-center gap-2.5 px-3.5">
      <span className="text-ink-2 flex items-center gap-2.5">
        <ArrowLeft size={17} strokeWidth={1.75} />
        <ArrowRight size={17} strokeWidth={1.75} className="text-ink-3" />
      </span>
      <span className="text-tau-meta text-ink-2 min-w-0 truncate">{crumb}</span>
      <span className="flex-1" />
      <span className="bg-surface text-tau-sm text-ink-2 shadow-card flex h-[30px] shrink-0 items-center gap-2 rounded-full pr-1 pl-3 max-sm:hidden">
        <Search size={13} strokeWidth={1.75} />
        搜索或跳转…
        <kbd className="bg-hover text-tau-tiny text-ink-2 inline-flex h-5 items-center rounded-md px-1.5 font-mono">
          Ctrl K
        </kbd>
      </span>
      <TitleIcon icon={MapIcon} />
      <TitleIcon icon={MessageCircle} on={assistOn} />
      <TitleIcon icon={Sun} />
    </header>
  );
}

export interface AppWindowProps {
  /** 侧栏选中项 */
  active?: NavKey;
  /** 标题栏面包屑 */
  crumb?: ReactNode;
  /** 侧栏形态：full 展开、rail 图标列、none 不显示（小窗、浮层） */
  sidebar?: "full" | "rail" | "none";
  assistOn?: boolean;
  /** 内容区高度，默认 380px */
  height?: number;
  /** 内容区是否铺一张纸（与桌面端页面的纸面一致） */
  paper?: boolean;
  className?: string;
  children: ReactNode;
}

export function AppWindow({
  active,
  crumb,
  sidebar = "rail",
  assistOn,
  height = 380,
  paper = true,
  className,
  children,
}: AppWindowProps) {
  return (
    <div
      className={cn(
        "bg-page font-tau text-tau-body text-ink-1 border-line-1 shadow-float flex overflow-hidden rounded-[14px] border select-none",
        className
      )}
    >
      {sidebar !== "none" && <Sidebar active={active} rail={sidebar === "rail"} />}
      <div className="flex min-w-0 flex-1 flex-col">
        {sidebar === "none" ? (
          <div className="flex h-[46px] items-center gap-3 px-3.5">
            <TrafficLights />
            <span className="text-tau-meta text-ink-2">{crumb}</span>
          </div>
        ) : (
          <Titlebar crumb={crumb} assistOn={assistOn} />
        )}
        <div className="min-h-0 flex-1 px-3 pb-3" style={{ height }}>
          {paper ? (
            <div className="bg-surface shadow-paper relative h-full overflow-hidden rounded-[12px]">
              {children}
            </div>
          ) : (
            <div className="relative h-full overflow-hidden">{children}</div>
          )}
        </div>
      </div>
    </div>
  );
}
