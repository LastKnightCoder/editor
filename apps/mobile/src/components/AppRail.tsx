import { useMobileI18n } from "../services/i18n-react";
// 中等与宽档的左侧导航条：替代底部 Dock，所有页面常驻（二级页也在）。
// 新建置顶（轻点展开创建菜单、长按直接说），4 个 Tab 根，分隔线下是自选入口，底部搜索。
// 自选入口即「我的」功能宫格的顺序，按剩余高度截取：全放得下就全放，放不下时最后一格换成「更多」。
// 宽度即 --screen-inset-left：页面层从导航条右缘起铺。

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Ellipsis, Mic, Plus, Search } from "lucide-react";
import { cn } from "@tau/ui";
import { useRouterContext, switchTabScreen, isTabRoot, type Navigator } from "../router";
import { QuickCreateMenu } from "./QuickCreateMenu";
import { useQuickCreate, type QuickCreateKey } from "./useQuickCreate";
import { NAV_TABS, useActiveTab } from "./navTabs";
import { setScreenInsetLeft } from "../router/screenInset";
import { useFeatureEntries, type FeatureEntry } from "../features/featureEntries/useFeatureEntries";
import { fitRailPins, type RailFit } from "./railFit";

/** 栈里离顶部最近的一页若属于某个自选入口，该入口高亮；Tab 根在它之上时以 Tab 为准 */
function resolveActivePin(
  entries: readonly { key: string; params: Record<string, unknown> }[],
  pins: readonly FeatureEntry[],
  isTab: (key: string) => boolean
): FeatureEntry | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i] as Parameters<FeatureEntry["owns"]>[0];
    if (isTab(entry.key)) return null;
    const pin = pins.find(item => item.owns(entry));
    if (pin) return pin;
  }
  return null;
}

/** 已在栈里就回到那一页（保留它上面打开的内容之外的状态），否则打开 */
function openPin(navigator: Navigator, pin: FeatureEntry) {
  const entries = navigator.getScreenStack().entries;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (!pin.owns(entries[i])) continue;
    if (i === entries.length - 1) return;
    if (navigator.popTo(entries[i].key, entries[i].params)) return;
  }
  pin.open();
}

export function AppRail() {
  const { t } = useMobileI18n();
  const { state, navigator } = useRouterContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const entries = state.screens.entries;
  const features = useFeatureEntries();
  const pinsRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<RailFit>({ count: 0, more: false });
  const moreRef = useRef<HTMLDivElement | null>(null);
  const [moreBottom, setMoreBottom] = useState(0);
  const activePin = resolveActivePin(entries, features, isTabRoot);
  // 自选入口打开的页面不归属任何 Tab，此时 Tab 不高亮
  const tabActive = useActiveTab();
  const activeTab = activePin ? null : tabActive;
  const topEntryId = entries[entries.length - 1]?.id;
  const navRef = useRef<HTMLElement | null>(null);

  // 导航条实际宽度（含横屏刘海的左侧安全区）即页面层左偏移；卸载时归零交还 Dock 布局
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const apply = () => setScreenInsetLeft(nav.offsetWidth);
    apply();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    observer?.observe(nav);
    return () => {
      observer?.disconnect();
      setScreenInsetLeft(0);
    };
  }, []);

  // 自选段可用高度随转屏、分屏、台前调度拖动变化，实时重算露出几个
  useLayoutEffect(() => {
    const slot = pinsRef.current;
    if (!slot) return;
    const apply = () => {
      const next = fitRailPins(slot.clientHeight, features.length);
      setFit(current =>
        current.count === next.count && current.more === next.more ? current : next
      );
    };
    apply();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    observer?.observe(slot);
    return () => observer?.disconnect();
  }, [features.length]);

  // 导航条位于页面上下文外，直接向路由仲裁器登记当前页的浮层返回消费器
  const anyMenuOpen = menuOpen || moreOpen;
  useEffect(() => {
    if (!anyMenuOpen || !topEntryId) return;
    return navigator.registerBackHandler(topEntryId, () => {
      setMenuOpen(false);
      setMoreOpen(false);
      return true;
    });
  }, [anyMenuOpen, topEntryId, navigator]);

  const quickCreate = useQuickCreate({
    onTap: () => setMenuOpen(open => !open),
    onHoldStart: () => setMenuOpen(false),
    captureBottom: "calc(var(--mobile-safe-bottom) + 24px)",
  });

  const closeMenus = () => {
    setMenuOpen(false);
    setMoreOpen(false);
  };

  const onCreate = (key: QuickCreateKey) => {
    closeMenus();
    quickCreate.run(key);
  };

  const switchTab = (key: string) => {
    closeMenus();
    switchTabScreen(navigator, key);
  };

  const onPin = (pin: FeatureEntry) => {
    closeMenus();
    openPin(navigator, pin);
  };

  const pins = features.slice(0, fit.count);
  const rest = features.slice(fit.count);
  // 放不下时「更多」收起，不能让菜单挂在一个看不见的按钮上
  const moreVisible = fit.more && moreOpen;

  return (
    <>
      {anyMenuOpen ? (
        <button
          type="button"
          aria-label={t("nav.closeMenu")}
          onClick={closeMenus}
          className="fixed inset-0"
          // 「更多」贴着按钮弹、不压暗页面；新建菜单沿用遮罩
          style={{ zIndex: 44, background: menuOpen ? "var(--tau-overlay)" : "transparent" }}
        />
      ) : null}
      <nav
        ref={navRef}
        aria-label={t("nav.main")}
        data-no-edge-back
        className="bg-page fixed top-0 bottom-0 left-0 flex flex-col items-center gap-2.5"
        style={{
          zIndex: 45,
          // 实底：转场中下层页面的视差位移不能从导航条底下透出
          width: "calc(80px + var(--mobile-safe-left))",
          paddingLeft: "var(--mobile-safe-left)",
          paddingTop: "calc(var(--mobile-safe-top) + 16px)",
          paddingBottom: "calc(var(--mobile-safe-bottom) + 16px)",
        }}
      >
        <div className="relative mb-3">
          <button
            type="button"
            aria-label={t("nav.create")}
            aria-expanded={menuOpen}
            className="text-ink-inverse grid h-12 w-12 place-items-center rounded-[16px] transition-transform duration-200 select-none"
            style={{
              ...quickCreate.fabBind.style,
              background: "var(--tau-accent)",
              boxShadow: quickCreate.holding
                ? "0 0 0 10px var(--tau-accent-soft), var(--tau-shadow-lift)"
                : "var(--tau-shadow-lift)",
              transform: quickCreate.holding
                ? "scale(1.12)"
                : menuOpen
                  ? "rotate(45deg)"
                  : undefined,
            }}
            onPointerDown={event => {
              setMoreOpen(false);
              quickCreate.fabBind.onPointerDown(event);
            }}
            onMouseDown={quickCreate.fabBind.onMouseDown}
            onContextMenu={quickCreate.fabBind.onContextMenu}
          >
            {quickCreate.holding ? (
              <Mic size={24} strokeWidth={2.4} aria-hidden="true" />
            ) : (
              <Plus size={22} strokeWidth={2.6} aria-hidden="true" />
            )}
          </button>
          {menuOpen ? (
            <QuickCreateMenu
              onSelect={onCreate}
              className="absolute top-0 left-[calc(100%+12px)]"
            />
          ) : null}
        </div>

        {NAV_TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <RailItem
              key={tab.key}
              label={tab.label}
              active={activeTab === tab.key}
              icon={active => (
                <Icon size={21} strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
              )}
              onClick={() => switchTab(tab.key)}
            />
          );
        })}

        {features.length > 0 ? (
          <span
            className="bg-line-1 my-1 h-px w-8 flex-none"
            aria-hidden="true"
            hidden={fit.count === 0 && !fit.more}
          />
        ) : null}
        <div
          ref={pinsRef}
          className="flex min-h-0 w-full flex-1 flex-col items-center gap-2.5 overflow-hidden"
        >
          {pins.map(pin => (
            <RailItem
              key={pin.key}
              label={pin.label}
              active={activePin?.key === pin.key}
              icon={() => pin.glyph}
              onClick={() => onPin(pin)}
            />
          ))}
          {fit.more ? (
            <div ref={moreRef} className="flex-none">
              <RailItem
                label={t("nav.more")}
                active={moreOpen || (activePin !== null && rest.includes(activePin))}
                expanded={moreOpen}
                icon={() => <Ellipsis size={21} strokeWidth={1.9} aria-hidden="true" />}
                onClick={() => {
                  setMenuOpen(false);
                  const rect = moreRef.current?.getBoundingClientRect();
                  if (rect) setMoreBottom(window.innerHeight - rect.bottom);
                  setMoreOpen(open => !open);
                }}
              />
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            closeMenus();
            navigator.push("search");
          }}
          aria-label={t("nav.search")}
          className="text-ink-2 active:bg-press grid h-11 w-11 place-items-center rounded-[14px]"
        >
          <Search size={21} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </nav>
      {moreVisible ? (
        <div
          role="menu"
          aria-label={t("nav.moreEntries")}
          className="bg-surface shadow-float fixed max-h-[70vh] w-[216px] overflow-y-auto rounded-[16px] p-1.5"
          style={{
            zIndex: 46,
            left: "calc(var(--screen-inset-left) + 4px)",
            bottom: moreBottom,
          }}
        >
          {rest.map(pin => (
            <button
              key={pin.key}
              type="button"
              role="menuitem"
              onClick={() => onPin(pin)}
              className={cn(
                "active:bg-press flex h-11 w-full items-center gap-3 rounded-[11px] px-2.5 text-[14.5px] font-semibold",
                activePin?.key === pin.key ? "text-accent-text" : "text-ink-1"
              )}
            >
              <span className="text-ink-2 grid w-6 flex-none place-items-center">{pin.glyph}</span>
              <span className="min-w-0 truncate">{pin.label}</span>
            </button>
          ))}
          <p className="border-line-1 text-ink-3 mx-2 mt-1 border-t pt-2 pb-1 text-[12px] leading-snug">
            {t("nav.pinHint")}
          </p>
        </div>
      ) : null}
      {quickCreate.captureCard}
    </>
  );
}

function RailItem(props: {
  label: string;
  active: boolean;
  expanded?: boolean;
  icon: (active: boolean) => ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={props.label}
      aria-current={props.active && props.expanded === undefined ? "page" : undefined}
      aria-expanded={props.expanded}
      className={cn(
        "flex h-12 w-[76px] flex-none flex-col items-center justify-end gap-1 text-[11px] font-semibold transition-colors duration-200",
        props.active ? "text-accent-text" : "text-ink-3"
      )}
    >
      <span
        className={cn(
          "grid h-[30px] w-[52px] place-items-center rounded-full transition-colors duration-200",
          props.active && "bg-accent-soft"
        )}
      >
        {props.icon(props.active)}
      </span>
      <span className="max-w-full truncate px-0.5">{props.label}</span>
    </button>
  );
}
