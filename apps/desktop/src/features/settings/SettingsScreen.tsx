/**
 * SettingsScreen —— 全窗口设置页（D-028，2026-09-30 由居中弹窗改为铺满窗口）。
 *
 * 壳层浮层（D-003 命令面板同族挂载，不进页面栈）：fixed 铺满整个窗口，连同应用侧栏一起覆盖。
 * 左栏 = 设置侧栏（固定 220px，不跟随应用侧栏拖宽；条目与应用侧栏同语言：窗口控制 / 返回 / 分组导航）；右栏 = 标题栏拖拽区 +
 * 居中内容列（页头取 sections.tsx 的 label + description，随正文一起滚动）。
 * 开闭态在 app/settingsStore（Sidebar / 命令面板 / Ctrl+, 多入口共享）。
 * Esc 经 useOverlayDismiss 注册表仲裁；关闭时焦点归还触发元素。
 * 即时保存模型：无应答区，改了就生效。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { useOverlayDismiss } from "@/page/PageProvider";
import { useEdgeFade } from "@tau/ui";
import { isMac, isWinOrLinux } from "@/platform";
import { useSettingsStore, type SettingsLocation } from "@/app/settingsStore";
import { MacTrafficLights, WindowControls } from "@/app/WindowControls";
import { useFullScreen } from "@/app/useFullScreen";
import { useFindOwner } from "@/components/GlobalFindBar/findOwner";
import { FadeScroll } from "@tau/ui";
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, type SettingsSectionDef } from "./sections";

export function SettingsScreen() {
  const open = useSettingsStore(s => s.open);
  const closeSettings = useSettingsStore(s => s.closeSettings);
  const section = useSettingsStore(s => s.section);
  const setSection = useSettingsStore(s => s.setSection);
  const fullScreen = useFullScreen();
  const rootRef = useRef<HTMLDivElement>(null);

  useOverlayDismiss(closeSettings, open);

  // 打开时焦点移入设置页，关闭时还给触发元素（关态 inert，浏览器只会丢到 body）
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    rootRef.current?.focus({ preventScroll: true });
    return () => trigger?.focus();
  }, [open]);

  // 打开态吞掉 Ctrl/⌘+F：设置页盖住了底下的页面，页内查找不应作用于被遮住的内容
  useFindOwner(() => undefined, open);

  // Ctrl+/Cmd+, 全局开关（输入法组合让位）
  useEffect(() => {
    const onKeydown = (e: globalThis.KeyboardEvent) => {
      if (e.isComposing || !(e.ctrlKey || e.metaKey)) return;
      if (e.key === ",") {
        e.preventDefault();
        const s = useSettingsStore.getState();
        if (s.open) s.closeSettings();
        else s.openSettings();
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  const activeDef = useMemo(
    () => SETTINGS_SECTIONS.find(s => s.key === section) ?? SETTINGS_SECTIONS[0],
    [section]
  );
  const ActiveSection = activeDef.component;

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [navEl, setNavEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(navEl);

  // Electron 的 app-region 不理会 pointer-events / 透明度：关态若保留拖拽区，
  // 会盖住底下侧栏头部与标题栏的按钮，故只在打开时挂
  const dragRegion = open && "app-region-drag";

  // 切换分区回到页顶
  useEffect(() => {
    if (scrollEl) scrollEl.scrollTop = 0;
  }, [section, scrollEl]);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      tabIndex={-1}
      inert={!open}
      aria-hidden={!open}
      className={clsx(
        // z 低于命令面板（100）：设置页内仍可 Ctrl+K 唤起面板；子页的 Dialog/Select 层级更高
        "bg-page fixed inset-0 z-[90] grid grid-cols-[220px_minmax(0,1fr)] outline-none",
        "ease-tau-out transition-opacity duration-[160ms]",
        open ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      {/* 左栏：设置侧栏（几何对齐应用侧栏：px-2.5、头部占标题栏高度） */}
      <nav className="flex min-h-0 flex-col px-2.5 pb-3" aria-label="设置分区">
        <div
          className={clsx(
            dragRegion,
            "flex h-[var(--tau-titlebar-h)] shrink-0 items-center px-1.5"
          )}
        >
          {isMac && !fullScreen && <MacTrafficLights collapsed={false} />}
        </div>
        <button
          type="button"
          className={clsx(
            navRowClass,
            "text-ink-2 hover:bg-hover hover:text-ink-1 mb-1.5 gap-2.5 px-2.5"
          )}
          onClick={closeSettings}
          title="返回 (Esc)"
        >
          <ArrowLeft className="shrink-0" size="1.06em" strokeWidth={1.75} />
          <span className="min-w-0 truncate">返回应用</span>
        </button>
        <div
          ref={setNavEl}
          className="edge-fade-scroll -mr-[5px] min-h-0 flex-1 overflow-y-auto pr-[5px]"
        >
          {SETTINGS_GROUPS.map(group => (
            <div key={group.label} className="mt-3">
              <div className="text-tau-tiny text-ink-3 px-2.5 pb-1.5">{group.label}</div>
              <div className="space-y-0.5">
                {group.sections.map(def => (
                  <SectionNavButton
                    key={def.key}
                    def={def}
                    active={def.key === activeDef.key}
                    onSelect={() => setSection(def.key)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* 右栏：标题栏拖拽区 + 独立滚动的居中内容列 */}
      <div className="grid min-h-0 min-w-0 grid-rows-[var(--tau-titlebar-h)_minmax(0,1fr)]">
        <div className={clsx(dragRegion, "flex items-center justify-end px-3.5")}>
          {isWinOrLinux && (
            <div className="app-region-no-drag">
              <WindowControls />
            </div>
          )}
        </div>
        <FadeScroll
          scrollRef={setScrollEl}
          className="mr-1.5 min-h-0 overscroll-y-contain [scrollbar-gutter:stable]"
        >
          <div className="mx-auto w-full max-w-[880px] px-10 pb-16 pt-6">
            <header className="mb-7">
              <h1 className="text-tau-title-lg text-ink-1 font-semibold">{activeDef.label}</h1>
              <p className="text-tau-meta text-ink-2 mt-1">{activeDef.description}</p>
            </header>
            <ActiveSection key={activeDef.key} />
          </div>
        </FadeScroll>
      </div>
    </div>
  );
}

// 行高随字号档位折算，与应用侧栏条目同口径（见 app/Sidebar.tsx NavItemButton）
const navRowClass =
  "text-tau-body flex h-[calc(1.65em+8px)] w-full items-center rounded-[10px] text-left " +
  "ease-tau-out transition-[background,color] duration-[160ms]";

function SectionNavButton({
  def,
  active,
  onSelect,
}: {
  def: Pick<SettingsSectionDef, "label" | "icon"> & { key: SettingsLocation };
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = def.icon;
  return (
    <button
      type="button"
      className={clsx(
        navRowClass,
        "gap-2.5 px-2.5",
        active ? "bg-selected text-ink-1 font-medium" : "text-ink-2 hover:bg-hover hover:text-ink-1"
      )}
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
    >
      <Icon className="shrink-0" size="1.06em" strokeWidth={1.75} />
      <span className="min-w-0 truncate">{def.label}</span>
    </button>
  );
}
