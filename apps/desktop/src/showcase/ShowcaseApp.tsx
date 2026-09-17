/**
 * 样板间壳层 —— 侧栏（透明融于 page，条目/激活态复刻真实 Sidebar 语言）+ 右列
 * titlebar + 档案内容 + 状态栏。
 * 层级：page 环境 → surface 卡 → 展品（展品背后不加底色块，2026-09-17 用户裁决）。
 *
 * **版心统一**（2026-09-17 用户要求「统一设置版心，然后水平居中」）：全页只有
 * 一条宽度 `PAGE_COL`，由本文件在 titlebar / 内容区 / 状态栏三处同一居中承载——
 * 原先"展品满宽 + 文本列 740"两套宽度让页面像被切成两截，且宽屏下内容会一直摊到窗口边。
 * 宽度值收在 kit.tsx 的 `PAGE_COL` 单一常量里，改一处全页生效。
 *
 * 主题入口用三分段而非 Titlebar 的循环按钮：样板间的主要用途是**配色对照**，
 * 循环按钮看完不知道当前在哪一档，三态可直接点选。
 */

import { useState } from "react";
import clsx from "clsx";
import { Monitor, Moon, Sun } from "lucide-react";
import logo from "@/assets/logo.png";
import { useThemeStore, type ThemeMode } from "@/ui/theme/themeStore";
import { ToastHost } from "@/ui/primitives/Toast";
import { PAGE_COL, Segmented } from "./kit";
import { SECTIONS, SECTION_GROUPS, type SectionKey } from "./sections/registry";

const THEME_MODES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "cream", label: "浅色", icon: Sun },
  { value: "cocoa", label: "深色", icon: Moon },
  { value: "system", label: "系统", icon: Monitor },
];

export function ShowcaseApp() {
  const [activeKey, setActiveKey] = useState<SectionKey>("iconbutton");
  const mode = useThemeStore(s => s.mode);
  const resolved = useThemeStore(s => s.resolved);
  const setMode = useThemeStore(s => s.setMode);

  const active = SECTIONS.find(s => s.key === activeKey)!;
  const ActiveView = active.component;

  return (
    <div className="app font-tau bg-page text-ink-1 grid h-screen grid-cols-[var(--tau-sidebar-w)_minmax(0,1fr)] text-[13px]">
      {/* 侧栏：透明融于 page，激活态 = 淡墨底 + 左缘 accent 竖点（同真实 Sidebar，
          图标不指定颜色、随按钮色继承，避免与真实侧栏漂移） */}
      <nav aria-label="样板间导航" className="flex flex-col overflow-y-auto px-2.5 pb-3">
        <div className="mb-1.5 flex h-[var(--tau-titlebar-h)] shrink-0 items-center gap-2 px-1.5">
          <img
            src={logo}
            alt="Tau"
            draggable={false}
            className="size-6 shrink-0 select-none mix-blend-multiply dark:mix-blend-normal dark:brightness-[0.85]"
          />
          <span className="text-tau-body-lg font-semibold">
            Tau <span className="text-ink-2 font-normal">样板间</span>
          </span>
        </div>

        <div className="min-h-0 flex-1">
          {SECTION_GROUPS.map(section => (
            <div key={section.label} className="mt-3 first:mt-0">
              <div className="text-tau-tiny text-ink-3 px-2.5 pb-1.5 font-[550] tracking-[0.02em]">
                {section.label}
              </div>
              {section.items.map(item => {
                const ItemIcon = item.icon;
                const isActive = item.key === activeKey;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={clsx(
                      "text-tau-body flex h-[34px] w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left",
                      "ease-tau-out transition-[background,color] duration-[160ms]",
                      isActive
                        ? "bg-selected text-ink-1 before:bg-accent relative font-medium before:absolute before:-left-2.5 before:bottom-2 before:top-2 before:w-[3px] before:rounded-r-[3px] before:content-['']"
                        : "text-ink-2 hover:bg-hover hover:text-ink-1"
                    )}
                    onClick={() => setActiveKey(item.key)}
                  >
                    <ItemIcon className="shrink-0" size={17} strokeWidth={1.75} />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </nav>

      {/* 右列：titlebar + 档案内容 + 状态栏 */}
      <div className="bg-page flex min-w-0 flex-col">
        {/* titlebar / 内容 / 状态栏共用同一条版心（PAGE_COL）并居中，三处一条竖线贯通 */}
        <header className="shrink-0 px-10">
          <div
            className={clsx("mx-auto flex h-[var(--tau-titlebar-h)] items-center gap-3", PAGE_COL)}
          >
            <span className="text-tau-meta text-ink-3">
              样板间 / <b className="text-ink-1 font-[550]">{active.label}</b>
            </span>
            <div className="flex-1" />
            <span className="font-tau-mono text-tau-tiny text-ink-3">
              {mode === "system" ? `system → ${resolved}` : resolved}
            </span>
            <Segmented
              value={mode}
              onChange={setMode}
              options={THEME_MODES.map(({ value, label, icon: Icon }) => ({
                value,
                title: label,
                label: (
                  <>
                    <Icon size={14} strokeWidth={1.75} className="shrink-0" />
                    <span className="text-tau-micro">{label}</span>
                  </>
                ),
              }))}
            />
          </div>
        </header>

        <main className="pb-25 min-h-0 flex-1 overflow-y-auto px-10 pt-8">
          <div className={clsx("mx-auto", PAGE_COL)}>
            <ActiveView key={activeKey} />
          </div>
        </main>

        <footer className="text-tau-micro text-ink-3 shrink-0 px-10">
          <div
            className={clsx(
              "mx-auto flex h-[var(--tau-statusbar-h)] items-center justify-between gap-4",
              PAGE_COL
            )}
          >
            <span>Tau 样板间 · 组件检查器 · 端口 6199（纯浏览器，不依赖客户端）</span>
            <span>层级 page → surface → 展品 · 展品为本体实现（ui/primitives）</span>
          </div>
        </footer>
      </div>

      <ToastHost />
    </div>
  );
}
