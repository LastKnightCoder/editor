/**
 * AppShell —— 融合骨架，样式 Tailwind 优先（D-013，视觉基准 mockups/direction-a-soft.html）。
 *
 *   ┌──────────┬──────────────────────────┐
 *   │ sidebar-head │ titlebar（右列专属）    │ ← 46px 对齐
 *   │ 导航图标      │ content（page 栈）     │
 *   │ （整高贯通）  │ statusbar（右列专属）   │
 *   └──────────┴──────────────────────────┘
 *
 * 挂载：主窗口 / 默认重定向 /shell（router.tsx）；旧主界面在 /legacy。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { PageProvider, usePage } from "@/page/PageProvider";
import { PageHost } from "@/page/PageHost";
import { initThemeRuntime } from "@/ui/theme/themeStore";
import { Sidebar } from "./Sidebar";
import { Titlebar } from "./Titlebar";
import { useShellStore, SIDEBAR_MIN_W, SIDEBAR_MAX_W } from "./shellStore";
import { ensureLegacyPages } from "@/page/legacy";
import { ensureDatabaseReady } from "./databaseReady";
import "./base.css";
import "../pages";

// 壳层根：三列骨架（侧栏 / 拖宽热区 / 右列）；排版基准 text-tau-body = 13px/1.65。
// 行必须显式 100vh：grid 隐式 auto 行会让右列随内容撑高，滚动链整条失效
const shellRootClass =
  "relative grid h-screen min-w-[1080px] grid-cols-[auto_4px_minmax(0,1fr)] grid-rows-[100vh] " +
  "overflow-hidden bg-page font-tau text-tau-body text-ink-1 antialiased";

// legacy 模块占位注册（真实 page 注册后自动让位）
ensureLegacyPages();

export default function AppShell() {
  const [boot, setBoot] = useState<"connecting" | "failed" | "ready">("connecting");

  const connect = useCallback(() => {
    setBoot("connecting");
    // 数据命令的前置：连接当前数据库（失败停在启动屏，可重试或降级进入，
    // 各数据区块自行降级为空态）
    ensureDatabaseReady().then(ok => setBoot(ok ? "ready" : "failed"));
  }, []);

  useEffect(() => {
    initThemeRuntime();
    connect();
  }, [connect]);

  if (boot !== "ready") {
    return (
      <div className={shellRootClass}>
        {boot === "connecting" ? (
          <p className="text-ink-2 p-6">正在连接数据库…</p>
        ) : (
          <div className="text-ink-1 p-6">
            <p className="text-danger mb-3">数据库连接失败，数据区块将不可用。</p>
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
                className="rounded-tau-md bg-group text-ink-2 px-4 py-1.5"
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
      <ShellLayout />
    </PageProvider>
  );
}

function ShellLayout() {
  const { state } = usePage();
  const width = useShellStore(s => s.sidebarWidth);
  const setWidth = useShellStore(s => s.setSidebarWidth);
  const toggle = useShellStore(s => s.toggleSidebar);

  return (
    <div className={shellRootClass} style={{ ["--tau-sidebar-w" as string]: `${width}px` }}>
      <Sidebar />
      <SidebarResizer onResize={setWidth} onDoubleClick={toggle} />
      {/* 右列整体：标题栏/内容/状态栏只属于主区，侧栏整高贯通窗口（融合骨架） */}
      <div className="grid min-w-0 grid-rows-[var(--tau-titlebar-h)_minmax(0,1fr)_var(--tau-statusbar-h)]">
        <Titlebar />
        <main className="min-h-0 overflow-y-auto">
          <PageHost state={state} />
        </main>
        <footer className="text-tau-micro text-ink-3 flex select-none items-center gap-4 px-3.5" />
      </div>
    </div>
  );
}

/** 侧栏拖宽热区（透明，hover/拖动显形；双击折叠）。 */
function SidebarResizer({
  onResize,
  onDoubleClick,
}: {
  onResize: (w: number) => void;
  onDoubleClick: () => void;
}) {
  const dragging = useRef<{ x: number; startW: number } | null>(null);
  const [active, setActive] = useState(false);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging.current) return;
      const w = Math.min(
        SIDEBAR_MAX_W,
        Math.max(SIDEBAR_MIN_W, dragging.current.startW + e.clientX - dragging.current.x)
      );
      onResize(w);
    },
    [onResize]
  );

  const onMouseUp = useCallback(() => {
    dragging.current = null;
    document.body.style.userSelect = "";
    setActive(false);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  return (
    <div
      className={clsx("hover:bg-hover cursor-col-resize rounded-[2px]", active && "bg-hover")}
      title="拖动调整侧边栏宽度，双击折叠"
      onMouseDown={e => {
        // 起始宽度读 store（CSS 变量设在壳层根上且 :root 只有静态默认值，读 ComputedStyle 会拿错）
        dragging.current = { x: e.clientX, startW: useShellStore.getState().sidebarWidth };
        document.body.style.userSelect = "none";
        setActive(true);
        e.preventDefault();
      }}
      onDoubleClick={onDoubleClick}
    />
  );
}
