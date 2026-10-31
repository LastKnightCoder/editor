// 设置根页（我的 Tab）：功能宫格 + 总览入口。
// 二级模块由 settingsModule 路由页承载（独立栈级，返回/滚动由 router 管理）。

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { useEdgeFade } from "../../hooks/useScrollState";
import {
  Article,
  Cards,
  DotsThree,
  FolderOpen,
  ListChecks,
  Palette,
  Timer,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { OverviewSection } from "./components/OverviewSection";
import type { SettingModuleKey, SettingsPageProps } from "./components/types";
import { toast } from "../../components/toast";
import { ActionSheet } from "../../components/ActionSheet";

/** 宫格里的外部入口（插件功能）：tile 为 46px 图标块 */
export type FeatureGridEntry = {
  key: string;
  label: string;
  tile: ReactNode;
  onClick: () => void;
};

type SettingsScreenProps = SettingsPageProps & {
  pluginEntries?: ReactNode;
  /** 功能宫格里接在内置功能后的插件入口 */
  pluginFeatures?: readonly FeatureGridEntry[];
  /** 打开二级模块（压入 settingsModule 路由页） */
  onOpenModule: (module: SettingModuleKey) => void;
  /** 功能宫格：任务中心（模块启用时展示） */
  onOpenTodo?: () => void;
  /** 功能宫格：番茄专注（模块启用时展示） */
  onOpenPomodoro?: () => void;
  /** 页头：全局搜索 */
  onOpenSearch?: () => void;
  /** 功能宫格：文章 / 项目 / 知识库 / 闪卡 */
  onOpenArticles?: () => void;
  onOpenProjects?: () => void;
  onOpenKnowledge?: () => void;
  onOpenFlashcard?: () => void;
};

/** 宫格最多两行；超出时第 8 格换成「更多」 */
const GRID_LIMIT = 8;

type FeatureItem = {
  key: string;
  label: string;
  tile: ReactNode;
  soon?: boolean;
  onClick: () => void;
};

/** 功能宫格：内置功能在前，插件功能入口按启用顺序接在后面 */
function FeatureGrid(props: {
  onOpenTodo?: () => void;
  onOpenPomodoro?: () => void;
  onOpenArticles?: () => void;
  onOpenProjects?: () => void;
  onOpenKnowledge?: () => void;
  onOpenFlashcard?: () => void;
  pluginItems?: readonly FeatureGridEntry[];
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const builtin = (
    key: string,
    Icon: Icon,
    tone: string,
    soft: string,
    label: string,
    onClick: () => void,
    soon?: boolean
  ): FeatureItem => ({
    key,
    label,
    soon,
    onClick,
    tile: (
      <span
        className="grid h-[46px] w-[46px] place-items-center rounded-[17px]"
        style={{ background: soft }}
      >
        <Icon size={26} weight="regular" color={tone} aria-hidden="true" />
      </span>
    ),
  });
  const items: FeatureItem[] = [
    builtin(
      "todo",
      ListChecks,
      "var(--tau-tag-4)",
      "var(--tau-tag-4-soft)",
      "任务",
      props.onOpenTodo ?? (() => toast({ type: "info", text: "任务模块未启用" }))
    ),
    builtin(
      "article",
      Article,
      "var(--tau-accent)",
      "var(--tau-accent-soft)",
      "文章",
      props.onOpenArticles ?? (() => toast({ type: "info", text: "文章即将上线" }))
    ),
    builtin(
      "project",
      FolderOpen,
      "var(--tau-tag-3)",
      "var(--tau-tag-3-soft)",
      "项目",
      props.onOpenProjects ?? (() => toast({ type: "info", text: "项目即将上线" }))
    ),
    builtin(
      "flashcard",
      Cards,
      "var(--tau-tag-3)",
      "var(--tau-tag-3-soft)",
      "闪卡",
      props.onOpenFlashcard ?? (() => toast({ type: "info", text: "闪卡模块未启用" }))
    ),
    builtin(
      "whiteboard",
      Palette,
      "var(--tau-tag-5)",
      "var(--tau-tag-5-soft)",
      "白板",
      () => toast({ type: "info", text: "白板即将上线" }),
      true
    ),
    builtin(
      "pomodoro",
      Timer,
      "var(--tau-tag-5)",
      "var(--tau-tag-5-soft)",
      "番茄",
      props.onOpenPomodoro ?? (() => toast({ type: "info", text: "番茄模块未启用" }))
    ),
    ...(props.pluginItems ?? []).map(entry => ({
      key: `plugin:${entry.key}`,
      label: entry.label,
      tile: entry.tile,
      onClick: entry.onClick,
    })),
  ];
  const overflow = items.length > GRID_LIMIT;
  const visible = overflow ? items.slice(0, GRID_LIMIT - 1) : items;

  return (
    <>
      <div className="rounded-card bg-surface shadow-card grid grid-cols-4 gap-2.5 px-2.5 py-4">
        {visible.map(item => (
          <FeatureButton key={item.key} item={item} />
        ))}
        {overflow ? (
          <FeatureButton
            item={{
              key: "more",
              label: "更多",
              onClick: () => setMoreOpen(true),
              tile: (
                <span className="bg-hover text-ink-2 grid h-[46px] w-[46px] place-items-center rounded-[17px]">
                  <DotsThree size={26} weight="bold" aria-hidden="true" />
                </span>
              ),
            }}
          />
        ) : null}
      </div>
      {overflow ? (
        <ActionSheet
          open={moreOpen}
          title="全部功能"
          onClose={() => setMoreOpen(false)}
          items={items.slice(GRID_LIMIT - 1).map(item => ({
            key: item.key,
            label: item.label,
            icon: <span className="scale-[0.6]">{item.tile}</span>,
            onClick: item.onClick,
          }))}
        />
      ) : null}
    </>
  );
}

function FeatureButton({ item }: { item: FeatureItem }) {
  return (
    <button
      type="button"
      onClick={item.onClick}
      className="relative flex min-w-0 flex-col items-center gap-[7px] py-2 transition-transform duration-200 active:scale-90"
    >
      {item.soon ? (
        <span className="bg-tag-4-soft text-tag-4 absolute top-0 right-1 rounded-full px-[5px] py-[1.5px] text-[8.5px] font-bold tracking-wide">
          即将
        </span>
      ) : null}
      {item.tile}
      <span className="text-ink-2 max-w-full truncate px-0.5 text-[11px] font-semibold">
        {item.label}
      </span>
    </button>
  );
}

export function SettingsPage(props: SettingsScreenProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);
  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <header className="flex items-center justify-between px-[18px] pt-[calc(20px+var(--mobile-safe-top))]">
        <h1 className="text-ink-1 text-2xl font-extrabold tracking-tight">我的</h1>
        <button
          type="button"
          onClick={props.onOpenSearch ?? (() => {})}
          aria-label="搜索所有内容"
          className="bg-surface text-ink-2 shadow-card grid h-[42px] w-[42px] place-items-center rounded-[15px] transition-transform duration-200 active:scale-88"
        >
          <Search size={20} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </header>

      <div ref={scrollRef} className="edge-fade-scroll dock-pad flex-1 overflow-y-auto px-4">
        <div className="mt-4">
          <FeatureGrid
            onOpenTodo={props.onOpenTodo}
            onOpenPomodoro={props.onOpenPomodoro}
            onOpenArticles={props.onOpenArticles}
            onOpenProjects={props.onOpenProjects}
            onOpenKnowledge={props.onOpenKnowledge}
            onOpenFlashcard={props.onOpenFlashcard}
            pluginItems={props.pluginFeatures}
          />
        </div>
        {props.pluginEntries}
        <div className="mt-4">
          <OverviewSection
            activeResource={props.safeSetting?.imageBed.active ?? "local"}
            activeDatabase={props.databases?.activeDatabase}
            imageAppearance={props.safeSetting?.appearance?.image}
            onOpenModule={props.onOpenModule}
          />
        </div>
      </div>
    </div>
  );
}
