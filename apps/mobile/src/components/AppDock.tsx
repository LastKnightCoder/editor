import { useMobileI18n } from "../services/i18n-react";
// 全局底部 Dock（v2 模板）：4 个 Tab 根（今天/卡片/日记/我的）+ 中央 FAB。
// FAB 轻点在正上方浮出新建菜单，长按直接语音速记。
// 由 AppShell 在 RouterProvider 内挂载：只在 4 个 Tab 根显示，
// 编辑器/详情/任务中心/番茄专注等二级页自动隐藏；Tab 切换 = popTo 已有实例或 push 新页。

import { useEffect, useState } from "react";
import { Mic, Plus } from "lucide-react";
import { useRouterContext, switchTabScreen, resolveTabNeighbor, isTabRoot } from "../router";
import { useKeyboardViewport } from "./KeyboardViewportProvider";
import { warmupDiaryTabCache } from "../features/diary/store/useDiaryStore";
import { QuickCreateMenu } from "./QuickCreateMenu";
import { useQuickCreate, type QuickCreateKey } from "./useQuickCreate";
import { NAV_TABS, useActiveTab, type NavTab } from "./navTabs";

// 预热延迟：避开当前 tab 首屏渲染再拉邻居数据
const WARMUP_DELAY_MS = 600;

function AppDock() {
  const { t } = useMobileI18n();
  const { state, navigator } = useRouterContext();
  const [menuOpen, setMenuOpen] = useState(false);

  const entries = state.screens.entries;
  const topKey = entries[entries.length - 1]?.key ?? "home";
  const topEntryId = entries[entries.length - 1]?.id;
  // Dock 只在 Tab 根显示：二级页（任务中心/番茄专注等）与沉浸 overlay 一律隐藏
  const { isKeyboardVisible } = useKeyboardViewport();
  // 键盘弹出时让出底部：Dock 固定在屏幕底，键盘上方的可见区不再需要它
  const visible = isTabRoot(topKey) && !isKeyboardVisible;
  const activeTab = useActiveTab();

  // 离开 Dock 可见范围时收起 FAB 菜单
  useEffect(() => {
    if (!visible) setMenuOpen(false);
  }, [visible]);

  // Dock 位于页面上下文外，直接向路由仲裁器登记当前页的浮层返回消费器。
  useEffect(() => {
    if (!menuOpen || !topEntryId) return;
    return navigator.registerBackHandler(topEntryId, () => {
      setMenuOpen(false);
      return true;
    });
  }, [menuOpen, topEntryId, navigator]);

  // 邻居 tab 数据预热：延迟一拍避开当前 tab 首屏渲染，滑切拖出预览层时数据已在缓存。
  // 预热什么由各域自查（日记域外：卡片 tab 与首页共享全局查询、我的 tab 无首屏请求）
  useEffect(() => {
    if (!visible) return;
    const neighbors = [resolveTabNeighbor(activeTab, -1), resolveTabNeighbor(activeTab, 1)];
    if (!neighbors.includes("diaryHome")) return;
    const timer = window.setTimeout(() => warmupDiaryTabCache(), WARMUP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [visible, activeTab]);

  const switchTab = (key: string) => {
    setMenuOpen(false);
    switchTabScreen(navigator, key);
  };

  const quickCreate = useQuickCreate({
    onTap: () => setMenuOpen(open => !open),
    onHoldStart: () => setMenuOpen(false),
    captureBottom: "calc(var(--dock-visual-height) + 14px)",
  });
  const { holding } = quickCreate;

  const onFabAction = (key: QuickCreateKey) => {
    setMenuOpen(false);
    quickCreate.run(key);
  };

  if (!visible) return null;

  return (
    <>
      {menuOpen ? (
        <button
          type="button"
          aria-label={t("nav.closeCreate")}
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0"
          style={{ zIndex: 44, background: "var(--tau-overlay)" }}
          data-no-tab-swipe
        />
      ) : null}

      <nav
        aria-label={t("nav.main")}
        data-no-tab-swipe
        className="fixed inset-x-0 bottom-0"
        style={{
          zIndex: 45,
          paddingTop: "var(--dock-gap)",
          paddingBottom: "var(--dock-bottom-inset)",
          pointerEvents: "none",
          background: "var(--dock-bg)",
          // 不用 borderTop / 内层高光：深色下会呈现两条可见边线
        }}
      >
        <div className="pointer-events-auto relative mx-3 flex h-[62px] items-center rounded-[22px] px-2">
          {/* 菜单底边离 Dock 舰体上沿 12px，不压任何导航 */}
          <QuickCreateMenu
            onSelect={onFabAction}
            className="absolute bottom-[calc(100%+12px)] left-1/2"
            style={{
              zIndex: 1,
              opacity: menuOpen ? 1 : 0,
              transform: menuOpen
                ? "translateX(-50%)"
                : "translateX(-50%) translateY(12px) scale(0.96)",
              transformOrigin: "bottom center",
              pointerEvents: menuOpen ? "auto" : "none",
              visibility: menuOpen ? "visible" : "hidden",
              transition: menuOpen
                ? "transform 0.24s var(--ease-bounce), opacity 0.18s ease"
                : "transform 0.16s ease, opacity 0.12s ease, visibility 0s 0.16s",
            }}
          />

          {NAV_TABS.slice(0, 2).map(tab => (
            <DockTab
              key={tab.key}
              tab={tab}
              active={activeTab === tab.key}
              onClick={() => switchTab(tab.key)}
            />
          ))}

          <div className="grid w-[74px] shrink-0 justify-center">
            <button
              type="button"
              aria-label={t("nav.create")}
              aria-expanded={menuOpen}
              className="text-ink-inverse z-10 grid h-[54px] w-[54px] place-items-center rounded-[19px] transition-transform duration-200 select-none"
              style={{
                ...quickCreate.fabBind.style,
                background: "var(--tau-accent)",
                boxShadow: holding
                  ? "0 0 0 10px var(--tau-accent-soft), var(--tau-shadow-lift)"
                  : "var(--tau-shadow-lift)",
                transform: holding ? "scale(1.12)" : menuOpen ? "rotate(45deg)" : undefined,
              }}
              onPointerDown={quickCreate.fabBind.onPointerDown}
              onMouseDown={quickCreate.fabBind.onMouseDown}
              onContextMenu={quickCreate.fabBind.onContextMenu}
            >
              {holding ? (
                <Mic size={26} strokeWidth={2.4} aria-hidden="true" />
              ) : (
                <Plus size={24} strokeWidth={2.6} aria-hidden="true" />
              )}
            </button>
          </div>

          {NAV_TABS.slice(2).map(tab => (
            <DockTab
              key={tab.key}
              tab={tab}
              active={activeTab === tab.key}
              onClick={() => switchTab(tab.key)}
            />
          ))}
        </div>
      </nav>
      {quickCreate.captureCard}
    </>
  );
}

function DockTab({ tab, active, onClick }: { tab: NavTab; active: boolean; onClick: () => void }) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={tab.label}
      aria-current={active ? "page" : undefined}
      className="flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-[3px] transition-colors duration-200"
      style={{ color: active ? "var(--tau-accent)" : "var(--tau-ink-3)" }}
    >
      {/* 选中态靠颜色与描边粗细区分，不加背景 */}
      <span className="grid h-[26px] place-items-center">
        {/* 描边粗细走 CSS 属性而非 SVG attribute，才能和颜色一起过渡 */}
        <Icon
          size={20}
          aria-hidden="true"
          style={{ strokeWidth: active ? 2.3 : 1.9, transition: "stroke-width 0.2s ease" }}
        />
      </span>
      <span className="text-[10px] font-semibold">{tab.label}</span>
    </button>
  );
}

export { AppDock };
