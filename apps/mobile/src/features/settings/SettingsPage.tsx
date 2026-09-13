// 设置根页（我的 Tab）：功能宫格 + 总览入口。
// 二级模块由 settingsModule 路由页承载（独立栈级，返回/滚动由 router 管理）。

import { useRef } from "react";
import { Search } from "lucide-react";
import { useEdgeFade } from "../../hooks/useScrollState";
import {
  Article,
  Books,
  Cards,
  FolderOpen,
  ListChecks,
  Palette,
  Timer,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { OverviewSection } from "./components/OverviewSection";
import type { SettingModuleKey, SettingsPageProps } from "./components/types";
import { toast } from "../../components/toast";

type SettingsScreenProps = SettingsPageProps & {
  /** 打开二级模块（压入 settingsModule 路由页） */
  onOpenModule: (module: SettingModuleKey) => void;
  /** 功能宫格：任务中心（模块启用时展示） */
  onOpenTodo?: () => void;
  /** 功能宫格：番茄专注（模块启用时展示） */
  onOpenPomodoro?: () => void;
  /** 页头：全局搜索 */
  onOpenSearch?: () => void;
  /** 功能宫格：文章 / 项目 / 知识库 */
  onOpenArticles?: () => void;
  onOpenProjects?: () => void;
  onOpenKnowledge?: () => void;
};

/** 功能宫格：已上线模块直达 + 桌面版待迁移模块预告（v2 我的 Hub） */
function FeatureGrid(props: {
  onOpenTodo?: () => void;
  onOpenPomodoro?: () => void;
  onOpenArticles?: () => void;
  onOpenProjects?: () => void;
  onOpenKnowledge?: () => void;
}) {
  const items: Array<{
    key: string;
    icon: Icon;
    tone: string;
    label: string;
    soft: string;
    soon?: boolean;
    onClick: () => void;
  }> = [
    {
      key: "todo",
      icon: ListChecks,
      tone: "var(--butter)",
      label: "任务",
      soft: "var(--butter-soft)",
      onClick: props.onOpenTodo ?? (() => toast({ type: "info", text: "任务模块未启用" })),
    },
    {
      key: "article",
      icon: Article,
      tone: "var(--apricot)",
      label: "文章",
      soft: "var(--apricot-soft)",
      onClick: props.onOpenArticles ?? (() => toast({ type: "info", text: "文章即将上线" })),
    },
    {
      key: "project",
      icon: FolderOpen,
      tone: "var(--lilac)",
      label: "项目",
      soft: "var(--lilac-soft)",
      onClick: props.onOpenProjects ?? (() => toast({ type: "info", text: "项目即将上线" })),
    },
    {
      key: "document",
      icon: Books,
      tone: "var(--sage)",
      label: "知识库",
      soft: "var(--sage-soft)",
      onClick: props.onOpenKnowledge ?? (() => toast({ type: "info", text: "知识库即将上线" })),
    },
    {
      key: "flashcard",
      icon: Cards,
      tone: "var(--lilac)",
      label: "闪卡",
      soft: "var(--lilac-soft)",
      soon: true,
      onClick: () => toast({ type: "info", text: "闪卡复习即将上线" }),
    },
    {
      key: "whiteboard",
      icon: Palette,
      tone: "var(--rose)",
      label: "白板",
      soft: "var(--rose-soft)",
      soon: true,
      onClick: () => toast({ type: "info", text: "白板即将上线" }),
    },
    {
      key: "pomodoro",
      icon: Timer,
      tone: "var(--rose)",
      label: "番茄",
      soft: "var(--rose-soft)",
      onClick: props.onOpenPomodoro ?? (() => toast({ type: "info", text: "番茄模块未启用" })),
    },
  ];

  return (
    <div className="rounded-card bg-surface shadow-card grid grid-cols-4 gap-2.5 px-2.5 py-4">
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          onClick={item.onClick}
          className="relative flex flex-col items-center gap-[7px] py-2 transition-transform duration-200 active:scale-90"
        >
          {item.soon ? (
            <span className="bg-butter-soft text-butter absolute right-1 top-0 rounded-full px-[5px] py-[1.5px] text-[8.5px] font-bold tracking-wide">
              即将
            </span>
          ) : null}
          <span
            className="grid h-[46px] w-[46px] place-items-center rounded-[17px]"
            style={{ background: item.soft }}
          >
            <item.icon size={26} weight="regular" color={item.tone} aria-hidden="true" />
          </span>
          <span className="text-ink-2 text-[11px] font-semibold">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export function SettingsPage(props: SettingsScreenProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);
  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <header className="flex items-center justify-between px-[18px] pt-[calc(20px+var(--mobile-safe-top))]">
        <h1 className="text-ink text-2xl font-extrabold tracking-tight">我的</h1>
        <button
          type="button"
          onClick={props.onOpenSearch ?? (() => {})}
          aria-label="搜索所有内容"
          className="bg-surface text-ink-2 shadow-card active:scale-88 grid h-[42px] w-[42px] place-items-center rounded-[15px] transition-transform duration-200"
        >
          <Search size={20} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="edge-fade-scroll dock-pad mobile-kb-scroll flex-1 overflow-y-auto px-4"
        style={{ paddingBottom: "calc(var(--dock-visual-height) + 28px + var(--kb-height, 0px))" }}
      >
        <div className="mt-4">
          <FeatureGrid
            onOpenTodo={props.onOpenTodo}
            onOpenPomodoro={props.onOpenPomodoro}
            onOpenArticles={props.onOpenArticles}
            onOpenProjects={props.onOpenProjects}
            onOpenKnowledge={props.onOpenKnowledge}
          />
        </div>
        <div className="mt-4">
          <OverviewSection
            activeResource={props.safeSetting?.imageBed.active ?? "github"}
            activeDatabase={props.databases?.activeDatabase}
            collaborationServerUrl={props.safeSetting?.collaboration?.serverUrl}
            imageAppearance={props.safeSetting?.appearance?.image}
            onOpenModule={props.onOpenModule}
            resourceSyncProgress={props.resourceSyncProgress}
          />
        </div>
      </div>
    </div>
  );
}
