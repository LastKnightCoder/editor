// 全局底部 Dock（v2 模板）：4 个 Tab 根（今天/卡片/日记/我的）+ 中央 FAB。
// FAB 向上展开快捷创建（新卡片/新文章/新日程/写日记），图标沿用首页模块语义。
// 由 AppShell 在 RouterProvider 内挂载：只在 4 个 Tab 根显示，
// 编辑器/详情/任务中心/番茄专注等二级页自动隐藏；Tab 切换 = popTo 已有实例或 push 新页。

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { House, Layers, NotebookPen, Plus, User } from "lucide-react";
import { Article, BookOpen, CalendarPlus, Stack } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import {
  useRouterContext,
  switchTabScreen,
  TAB_ORDER,
  isTabRoot,
  resolveTabNeighbor,
  useTabSwipeOrigin,
  type TabKey,
} from "../router";
import { useAppContext } from "../app/AppContext";
import { useKeyboardViewport } from "./KeyboardViewportProvider";
import { useDiaryStore, warmupDiaryTabCache } from "../features/diary/store/useDiaryStore";
import { getTodayDateKey } from "../features/diary/feedUtils";
import { describeDiaryPeriod } from "../features/diary/dateKey";
import { useInvalidateArticles } from "../features/articles/queries";
import * as tauri from "../services/tauri";

// 视觉映射与顺序解耦：顺序契约（TAB_ORDER）在 router/tabs.ts，供滑动手势共用
const TAB_VISUALS: Record<TabKey, { label: string; icon: typeof House }> = {
  home: { label: "今天", icon: House },
  cardsLibrary: { label: "卡片", icon: Layers },
  diaryHome: { label: "日记", icon: NotebookPen },
  settings: { label: "我的", icon: User },
};

const TABS = TAB_ORDER.map(key => ({ key, ...TAB_VISUALS[key] }));

// 预热延迟：避开当前 tab 首屏渲染再拉邻居数据
const WARMUP_DELAY_MS = 600;

// FAB 环绕菜单：以 FAB 中心为原点，angle（度，-90 为正上方）/ radius 决定弧上落点
type FabAction = {
  key: "card" | "article" | "calendar" | "diary";
  label: string;
  icon: Icon;
  tone: string;
  soft: string;
  angle: number;
  delay: string;
};

// 四项菜单在导航上方另抬高 32px，保证外侧按钮也完全离开导航点击区域。
const FAB_ARC_RADIUS = 84;

/** 深色主题下单层 -soft 几乎与底色同色，叠此层数累积浓度，得到可感知的实色高亮 */
const HIGHLIGHT_SOFT_LAYERS = 3;

/**
 * 高亮块实色背景：-soft 在深色主题下是低透明度色（单层观感透明），这里叠加多层累积
 * 浓度并垫容器实底色，结果不透明且深浅主题都可感知。
 * 刻意不用 color-mix：旧版 WebView 会整条丢弃该声明，导致背景彻底消失。
 */
function highlightBackground(soft: string, base: string): CSSProperties {
  const layer = `linear-gradient(${soft}, ${soft})`;
  return {
    backgroundImage: Array.from({ length: HIGHLIGHT_SOFT_LAYERS }, () => layer).join(", "),
    backgroundColor: base,
  };
}

const FAB_ACTIONS: readonly FabAction[] = [
  {
    key: "card",
    label: "新卡片",
    icon: Stack,
    tone: "var(--tau-tag-2)",
    soft: "var(--tau-tag-2-soft)",
    angle: -157.5,
    delay: "0.06s",
  },
  {
    key: "article",
    label: "新文章",
    icon: Article,
    tone: "var(--tau-accent)",
    soft: "var(--tau-accent-soft)",
    angle: -112.5,
    delay: "0.02s",
  },
  {
    key: "calendar",
    label: "新日程",
    icon: CalendarPlus,
    tone: "var(--tau-tag-3)",
    soft: "var(--tau-tag-3-soft)",
    angle: -67.5,
    delay: "0.02s",
  },
  {
    key: "diary",
    label: "写日记",
    icon: BookOpen,
    tone: "var(--tau-tag-1)",
    soft: "var(--tau-tag-1-soft)",
    angle: -22.5,
    delay: "0.06s",
  },
];

function AppDock() {
  const { state, navigator } = useRouterContext();
  const app = useAppContext();
  const invalidateArticles = useInvalidateArticles();
  const [menuOpen, setMenuOpen] = useState(false);

  const entries = state.screens.entries;
  const topKey = entries[entries.length - 1]?.key ?? "home";
  const topEntryId = entries[entries.length - 1]?.id;
  // Dock 只在 Tab 根显示：二级页（任务中心/番茄专注等）与沉浸 overlay 一律隐藏
  const { isKeyboardVisible } = useKeyboardViewport();
  // 键盘弹出时让出底部：Dock 固定在屏幕底，键盘上方的可见区不再需要它
  const visible = isTabRoot(topKey) && !isKeyboardVisible;

  // 激活 Tab = 栈内最靠近顶部的 Tab 根（二级页归属其入口 Tab），兜底今天；
  // 滑动手势期间以 origin 为准——push 预推入会提前改栈，但高亮只应在页面
  // 滑完落定后跟随，避免"tab 先动页面后动"、取消时高亮来回跳
  const stackActiveTab = useMemo(() => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      if (isTabRoot(entries[i].key)) return entries[i].key;
    }
    return "home";
  }, [entries]);
  const activeTab = useTabSwipeOrigin() ?? stackActiveTab;

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

  const onFabAction = (key: FabAction["key"]) => {
    setMenuOpen(false);
    if (key === "card") {
      navigator.push("quickCapture");
      return;
    }
    if (key === "calendar") {
      // 预填今天：新建页自行取本地 0 点
      navigator.push("calendarEventEdit", { eventId: 0, prefillDate: Date.now() });
      return;
    }
    if (key === "article") {
      void (async () => {
        try {
          const article = await tauri.articleCreate({ title: "无标题文章" });
          invalidateArticles();
          navigator.push("articleEditor", { articleId: article.id });
        } catch (error) {
          app.presentError(error, "新建文章失败");
        }
      })();
      return;
    }
    void (async () => {
      try {
        const baseDate = getTodayDateKey();
        // 快捷创建语义：每次进入都开始一个新片段（当天无日记建首段、空片段复用）
        const contentId = await useDiaryStore.getState().startNewSegment("daily", baseDate);
        if (typeof contentId !== "number" || !Number.isFinite(contentId) || contentId <= 0) {
          throw new Error("DIARY_CONTENT_NOT_FOUND");
        }
        navigator.push("contentDetail", {
          contentId,
          contentTitle: "",
          fromDiary: true,
          diaryDate: describeDiaryPeriod("daily", baseDate),
        });
      } catch (error) {
        app.presentError(error, "打开日记失败");
      }
    })();
  };

  if (!visible) return null;

  return (
    <>
      {menuOpen ? (
        <button
          type="button"
          aria-label="关闭创建菜单"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0"
          style={{ zIndex: 44, background: "var(--tau-overlay)" }}
          data-no-tab-swipe
        />
      ) : null}

      <nav
        aria-label="主导航"
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
          {/* 菜单锚点抬离导航；收起时按钮回到 FAB 中心附近。 */}
          <div
            className="absolute bottom-[37px] left-1/2 h-0 w-0"
            style={{ zIndex: 1 }}
            aria-hidden={!menuOpen}
          >
            {FAB_ACTIONS.map(item => {
              const rad = (item.angle * Math.PI) / 180;
              const x = Math.cos(rad) * FAB_ARC_RADIUS;
              const y = Math.sin(rad) * FAB_ARC_RADIUS;
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onFabAction(item.key)}
                  tabIndex={menuOpen ? 0 : -1}
                  aria-label={item.label}
                  className="shadow-card absolute left-0 top-0 grid h-[46px] w-[46px] place-items-center rounded-[16px]"
                  style={{
                    ...highlightBackground(item.soft, "var(--surface)"),
                    opacity: menuOpen ? 1 : 0,
                    transform: menuOpen
                      ? `translate(-50%, -50%) translate(${x}px, ${y - 32}px)`
                      : "translate(-50%, -50%) scale(0.35)",
                    pointerEvents: menuOpen ? "auto" : "none",
                    transition: [
                      `transform 0.34s var(--ease-bounce) ${menuOpen ? item.delay : "0s"}`,
                      `opacity 0.2s ease ${menuOpen ? item.delay : "0s"}`,
                    ].join(", "),
                  }}
                >
                  <span className="bg-surface text-ink-1 shadow-card absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold">
                    {item.label}
                  </span>
                  <Icon size={23} weight="duotone" color={item.tone} aria-hidden="true" />
                </button>
              );
            })}
          </div>

          {TABS.slice(0, 2).map(tab => (
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
              onClick={() => setMenuOpen(open => !open)}
              aria-label="新建"
              aria-expanded={menuOpen}
              className="text-ink-inverse z-10 grid h-[54px] w-[54px] place-items-center rounded-[19px] transition-transform duration-200"
              style={{
                background: "var(--tau-accent)",
                boxShadow: "var(--tau-shadow-lift)",
                transform: menuOpen ? "rotate(45deg)" : undefined,
              }}
            >
              <Plus size={24} strokeWidth={2.6} aria-hidden="true" />
            </button>
          </div>

          {TABS.slice(2).map(tab => (
            <DockTab
              key={tab.key}
              tab={tab}
              active={activeTab === tab.key}
              onClick={() => switchTab(tab.key)}
            />
          ))}
        </div>
      </nav>
    </>
  );
}

function DockTab({
  tab,
  active,
  onClick,
}: {
  tab: (typeof TABS)[number];
  active: boolean;
  onClick: () => void;
}) {
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
