/**
 * AppShell —— 融合骨架，样式 Tailwind 优先（D-001）。
 *
 *   ┌──────────┬──────────────────────────┐
 *   │ sidebar-head │ titlebar（右列专属）    │ ← 46px 对齐
 *   │ 导航图标      │ content（page 栈）| 辅助栏 │
 *   │ （整高贯通）  │ statusbar（右列专属）   │
 *   └──────────┴──────────────────────────┘
 *
 * 挂载：主窗口 / 默认重定向 /shell（router.tsx）；旧主界面在 /legacy。
 */

import { lazy, Suspense, useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import clsx from "clsx";
import { PageProvider, usePage } from "@/page/PageProvider";
import { PageHost } from "@/page/PageHost";
import { PageNavigationBridge } from "./PageNavigationBridge";
import { Loading, NotificationHost, ToastHost, initScrollbarAutoHide } from "@tau/ui";
import { SearchPalette } from "@/features/search/SearchPalette";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import { useSearchStore } from "@/features/search/searchStore";
import { isReplayableVisit } from "@/features/search/searchMeta";
import useSettingStore from "@/stores/useSettingStore";
import useSyncFont from "@/hooks/useSyncFont";
import { useThemeRuntime } from "./useThemeRuntime";
import { Sidebar } from "./Sidebar";
import { Titlebar } from "./Titlebar";
import { AssistDock } from "./AssistDock";
import {
  useShellStore,
  SIDEBAR_COLLAPSED_W,
  SIDEBAR_COLLAPSE_W,
  SIDEBAR_EXPAND_W,
} from "./shellStore";
import { ensureDatabaseReady } from "./databaseReady";
import "./base.css";
import "../pages";

// 壳层根：三列骨架（侧栏 / 拖宽热区 / 右列）；排版基准 text-tau-body = 13px/1.65。
// 行必须显式 100vh：grid 隐式 auto 行会让右列随内容撑高，滚动链整条失效。
// app 类 = base.css 的 .app 作用域锚点（button cursor / focus-ring / 滚动条等 reset）
const shellRootClass =
  "app relative grid h-screen min-w-0 grid-cols-[auto_4px_minmax(0,1fr)] grid-rows-[100vh] " +
  "overflow-hidden bg-page font-tau text-tau-body text-ink-1 antialiased";

// 开发悬浮球：只在开发构建里加载（import.meta.env.DEV 为常量，生产包里整段被摇掉）
const DevFloatingBall = import.meta.env.DEV
  ? lazy(() => import("@/devtools").then(m => ({ default: m.DevFloatingBall })))
  : null;

export default function AppShell() {
  const databaseName = useSettingStore(state => state.setting.database.active);
  // key = 活动数据库名：切库时整体重建壳层（含启动连接流程与页面栈）
  return <ShellBody key={databaseName} />;
}

function ShellBody() {
  const [boot, setBoot] = useState<"connecting" | "failed" | "ready">("connecting");
  const [bootError, setBootError] = useState("");

  // 字体设置 → body CSS 变量（--font/--font-size/--mono-font）。legacy 挂在 App.tsx，
  // 新壳层不渲染它——不挂则 /shell 下字体设置全部失效（2026-09-21 外观页接线发现）
  useSyncFont();
  useThemeRuntime();

  const connect = useCallback(() => {
    setBoot("connecting");
    setBootError("");
    // 数据命令的前置：连接当前数据库（失败停在启动屏，可重试或降级进入，
    // 各数据区块自行降级为空态）
    ensureDatabaseReady(setBootError).then(ok => setBoot(ok ? "ready" : "failed"));
  }, []);

  useEffect(() => {
    const stopScrollbars = initScrollbarAutoHide();
    connect();
    return stopScrollbars;
  }, [connect]);

  /* 页面缩放（Ctrl±/Ctrl+滚轮）压缩 CSS 视口，壳层 min-w 会超出视口被裁：zoom
     变化时上报主进程按 zoomFactor 放大窗口最小尺寸。zoom 变化必伴生 window
     resize（视口 CSS 尺寸改变），resize 即统一信号源，覆盖全部缩放路径 */
  useEffect(() => {
    let lastZoom = 0;
    const reportZoom = () => {
      const zoom = window.electron?.getZoomFactor?.() ?? 1;
      if (zoom === lastZoom) return;
      lastZoom = zoom;
      void window.electron?.invoke("refresh-window-min-size");
    };
    reportZoom();
    window.addEventListener("resize", reportZoom);
    return () => window.removeEventListener("resize", reportZoom);
  }, []);

  if (boot !== "ready") {
    return (
      <div className={shellRootClass}>
        {boot === "connecting" ? (
          <div className="col-span-full flex min-w-0 flex-col items-center justify-center p-6">
            <Loading label="正在连接数据库…" minHeight={0} className="h-auto" />
            <p className="text-ink-2 text-tau-caption mt-3 max-w-md text-center">
              首次打开较大数据库时需要备份与历史数据迁移，可能耗时数分钟，请勿强制退出
            </p>
          </div>
        ) : (
          <div className="text-ink-1 p-6">
            <p className="text-danger mb-3">数据库连接失败，数据区块将不可用。</p>
            {bootError && (
              <p className="text-ink-2 text-tau-caption mb-3 max-w-2xl break-words">{bootError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={connect}
                className="rounded-tau-md bg-accent text-ink-inverse px-4 py-1.5"
              >
                重试
              </button>
              <button
                type="button"
                onClick={() => setBoot("ready")}
                disabled={/KNOWLEDGE_MIGRATION|DB_MODEL_INCOMPATIBLE|DB_SCHEMA_/.test(bootError)}
                className="rounded-tau-md bg-hover text-ink-2 px-4 py-1.5"
              >
                仍要进入
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <PageProvider initialKey="home">
      <PageNavigationBridge />
      <ShellLayout />
    </PageProvider>
  );
}

function ShellLayout() {
  const { state } = usePage();
  const width = useShellStore(s => s.sidebarWidth);
  const setWidth = useShellStore(s => s.setSidebarWidth);
  const toggle = useShellStore(s => s.toggleSidebar);
  // 拖拽中需即时跟随鼠标：Sidebar 据此关掉宽度过渡动画（否则 220ms 缓动成橡皮筋）
  const [sidebarResizing, setSidebarResizing] = useState(false);

  // 页面访问记录 → 搜索面板空态的「最近访问 + 常用」（D-003；连续停留同页只记一次）
  const recordVisit = useSearchStore(s => s.recordVisit);
  const currentKey = state.back[state.back.length - 1]?.key;
  const lastRecorded = useRef<string | null>(null);
  useEffect(() => {
    if (!currentKey || lastRecorded.current === currentKey) return;
    lastRecorded.current = currentKey;
    if (!isReplayableVisit(currentKey)) return; // 二级页只存 key 无法回跳（缺 id）
    recordVisit(currentKey);
  }, [currentKey, recordVisit]);

  return (
    <div className={shellRootClass} style={{ ["--tau-sidebar-w" as string]: `${width}px` }}>
      <Sidebar resizing={sidebarResizing} />
      <SidebarResizer
        onResize={setWidth}
        onDoubleClick={toggle}
        onDragChange={setSidebarResizing}
      />
      {/* 右列整体：标题栏/内容只属于主区，侧栏整高贯通窗口（融合骨架）。
          壳层不提供全局状态栏：需要的页面自带 PageStatusBar，避免无内容页底部留空条 */}
      <div className="grid min-w-0 grid-rows-[var(--tau-titlebar-h)_minmax(0,1fr)]">
        <Titlebar />
        {/* 正文 + 右侧辅助栏（AI 对话停靠栏，D-047）；覆盖浮层模式以本行为定位上下文。
            横向 clip：辅助栏收起时滑出右缘，不撑出滚动区（纵向不裁，保留卡片阴影）。
            min-w-0 必需：clip 不是滚动容器，不会清零自动最小宽度，页面内容（nowrap 长标题等）
            的 min-content 会经隐式 auto 列轨道把整列连同标题栏撑出窗口 */}
        <div className="relative flex min-h-0 min-w-0 overflow-x-clip">
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            <PageHost state={state} />
          </main>
          <AssistDock />
        </div>
      </div>
      {/* 全局命令面板浮层（Ctrl+K，D-003）：fixed 定位，须在 PageProvider 内使用导航 */}
      <SearchPalette />
      {/* 全局设置弹窗（Ctrl+,，D-028）：壳层浮层，同命令面板挂载模式 */}
      <SettingsDialog />
      {/* 全局通知卡栈（右上角，D-038）：协作申请 / 应用更新 / 发布结果等后台事件 */}
      <NotificationHost />
      {/* 全局 toast（z 高于命令面板与通知卡栈，面板打开时反馈仍可见） */}
      <ToastHost />
      {DevFloatingBall && (
        <Suspense fallback={null}>
          <DevFloatingBall />
        </Suspense>
      )}
    </div>
  );
}

/** 侧栏拖宽热区（透明，hover/拖动显形；双击折叠）。
 *  拖拽跨阈值切换展开/收起（业界通行语义）：收起态拉宽 ≥ 展开阈值即展开且宽度即时
 *  跟随鼠标；展开态拖窄 ≤ 收起阈值即收起（迟滞 20px 防边界抖动）。收起态未过阈值
 *  的拖拽不落宽度，保留用户上次的展开记忆宽。 */
function SidebarResizer({
  onResize,
  onDoubleClick,
  onDragChange,
}: {
  onResize: (w: number) => void;
  onDoubleClick: () => void;
  onDragChange: (dragging: boolean) => void;
}) {
  const dragging = useRef<{ x: number; startW: number } | null>(null);
  const [active, setActive] = useState(false);

  const endDrag = useCallback(() => {
    dragging.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    setActive(false);
    onDragChange(false);
  }, [onDragChange]);

  // pointer capture：拖出窗口边界事件不丢，无需 window 级监听
  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const drag = dragging.current;
      if (!drag) return;
      const raw = drag.startW + e.clientX - drag.x;
      const s = useShellStore.getState();
      if (s.sidebarCollapsed) {
        if (raw >= SIDEBAR_EXPAND_W) {
          s.setSidebarCollapsed(false);
          onResize(raw);
        }
      } else if (raw <= SIDEBAR_COLLAPSE_W) {
        s.setSidebarCollapsed(true);
      } else {
        onResize(raw);
      }
    },
    [onResize]
  );

  return (
    <div
      className={clsx("hover:bg-hover cursor-col-resize rounded-[2px]", active && "bg-hover")}
      title="拖动调整侧边栏宽度，双击折叠"
      onPointerDown={e => {
        // 起始宽度读 store 实况：收起态从图标列宽起算（读 ComputedStyle 会拿到 :root 静态默认值）
        const s = useShellStore.getState();
        dragging.current = {
          x: e.clientX,
          startW: s.sidebarCollapsed ? SIDEBAR_COLLAPSED_W : s.sidebarWidth,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
        setActive(true);
        onDragChange(true);
        e.preventDefault();
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={onDoubleClick}
    />
  );
}
