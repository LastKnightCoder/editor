/**
 * 样板间壳层 —— 侧栏（透明融于 page，条目/激活态复刻真实 Sidebar 语言）+ 右列
 * titlebar + 档案内容。
 * 层级：page 环境 → surface 卡 → 展品（展品背后不加底色块）。
 *
 * **滚动协议**（三层各自独立，整体不产出文档级滚动条）：根 grid 显式 100vh 行 +
 * `overflow-hidden` 锁死窗口滚动；侧栏头部 shrink-0 固定，滚动收口在条目列（同真实
 * Sidebar，logo 不随滚动）；内容滚动条经 `-mr/pr` 借位移进右侧 `px-10` 留白，离窗口
 * 右缘 16px（同首页 home-scroll 手法，内容盒右缘不动、与 titlebar 版心对齐）。
 * 两个滚动区都接 `.edge-fade-scroll` + useEdgeFade（首页同款边缘渐隐，只在真能滚的方向显形）；
 * 右列底部保留 statusbar 高度的空条，内容不贴窗口底边。
 * 显隐沿用全局协议（base.css + scrollbarAutoHide.ts）：4px 细墨条仅 hover/滚动中显形。
 *
 * **版心统一**：全页只有一条宽度 `PAGE_COL`，由本文件在 titlebar 与内容区两处
 * 同一居中承载——展品区与文本列各写各的宽度会让页面像被切成两截，且宽屏下内容会
 * 一直摊到窗口边。宽度值收在 kit.tsx 的 `PAGE_COL` 单一常量里，改一处全页生效。
 *
 * 主题入口用三分段而非 Titlebar 的循环按钮：样板间的主要用途是**配色对照**，
 * 循环按钮看完不知道当前在哪一档，三态可直接点选。
 */

import { useState } from "react";
import clsx from "clsx";
import { Monitor, Moon, Sun } from "lucide-react";
import logo from "@/assets/logo.png";
import { useEdgeFade, NotificationHost, ToastHost } from "@tau/ui";
import { useThemeStore, type ThemeMode } from "@tau/ui/theme/runtime";
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
  const [navScrollEl, setNavScrollEl] = useState<HTMLDivElement | null>(null);
  const [contentScrollEl, setContentScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(navScrollEl);
  useEdgeFade(contentScrollEl);

  return (
    <div className="app font-tau bg-page text-ink-1 grid h-screen grid-cols-[var(--tau-sidebar-w)_minmax(0,1fr)] grid-rows-[100vh] overflow-hidden text-[13px]">
      {/* 侧栏：透明融于 page，激活态 = 淡墨底 + 左缘 accent 竖点（同真实 Sidebar，
          图标不指定颜色、随按钮色继承，避免与真实侧栏漂移）。
          整高贯通、自身不滚动：头部固定，滚动只收在条目列 */}
      <nav aria-label="样板间导航" className="flex flex-col px-2.5 pb-3">
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

        {/* -mr/pr 借位（同真实 Sidebar）：滚动条移进侧栏右留白，条目宽度不受影响 */}
        <div
          ref={setNavScrollEl}
          className="edge-fade-scroll -mr-[5px] min-h-0 flex-1 overflow-y-auto pr-[5px]"
        >
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

      {/* 右列：titlebar + 档案内容 */}
      <div className="bg-page flex min-w-0 flex-col">
        {/* titlebar / 内容共用同一条版心（PAGE_COL）并居中，两处一条竖线贯通 */}
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

        {/* 内容滚动区：外框只承担版心留白（px-10），滚动条经 -mr/pr 借位移进右留白
            离窗口右缘 16px——内容盒宽度不变，因此与 titlebar 的 PAGE_COL 始终同一条竖线。
            边缘渐隐沿用首页协议（base.css 的 .edge-fade-scroll + useEdgeFade）；
            尾留白 pb-8 与顶部 pt-8 对称（底部不贴边由下方状态条承担，不叠加大留白） */}
        <main className="min-h-0 flex-1 px-10">
          <div
            ref={setContentScrollEl}
            className="edge-fade-scroll -mr-6 h-full overflow-y-auto pb-8 pr-6 pt-8"
          >
            <div className={clsx("mx-auto", PAGE_COL)}>
              <ActiveView key={activeKey} />
            </div>
          </div>
        </main>

        {/* 底部状态条：与页面状态栏同高（本页无状态文案，只余留白），
            内容不贴窗口底边 */}
        <footer className="h-[var(--tau-statusbar-h)] shrink-0" />
      </div>

      <NotificationHost />
      <ToastHost />
    </div>
  );
}
