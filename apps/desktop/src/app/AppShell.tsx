/**
 * AppShell —— 融合骨架，类名与结构 1:1 对齐 A2 模板（direction-a-soft.html）。
 *
 *   ┌──────────┬──────────────────────────┐
 *   │ sidebar-head │ titlebar（右列专属）    │ ← 46px 对齐
 *   │ 导航图标      │ content（surface 栈）  │
 *   │ （整高贯通）  │ statusbar（右列专属）   │
 *   └──────────┴──────────────────────────┘
 *
 * 挂载：主窗口 / 默认重定向 /shell（router.tsx）；旧主界面在 /legacy。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { SurfaceProvider, useSurface } from "@/surface/SurfaceProvider";
import { PageHost } from "@/surface/PageHost";
import { initTheme } from "@/ui/theme/theme";
import { Sidebar } from "./Sidebar";
import { Titlebar } from "./Titlebar";
import { useShellStore, SIDEBAR_MIN_W, SIDEBAR_MAX_W } from "./shellStore";
import { ensureLegacySurfaces } from "@/surface/legacy";
import { ensureDatabaseReady } from "./databaseReady";
import "./shell.css";
import "../surfaces";

// legacy 模块占位注册（真实 surface 注册后自动让位）
ensureLegacySurfaces();

export default function AppShell() {
  const [boot, setBoot] = useState<"connecting" | "failed" | "ready">("connecting");

  const connect = useCallback(() => {
    setBoot("connecting");
    // 数据命令的前置：连接当前数据库（失败停在启动屏，可重试或降级进入，
    // 各数据区块自行降级为空态）
    ensureDatabaseReady().then(ok => setBoot(ok ? "ready" : "failed"));
  }, []);

  useEffect(() => {
    initTheme();
    connect();
  }, [connect]);

  if (boot !== "ready") {
    return (
      <div className="app" style={{ fontFamily: "var(--tau-font)" }}>
        {boot === "connecting" ? (
          <p style={{ padding: 24, color: "var(--tau-ink-2)" }}>正在连接数据库…</p>
        ) : (
          <div style={{ padding: 24, color: "var(--tau-ink-1)" }}>
            <p style={{ color: "var(--tau-danger)", marginBottom: 12 }}>
              数据库连接失败，数据区块将不可用。
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={connect}
                style={{
                  padding: "6px 16px",
                  borderRadius: "var(--tau-radius-md)",
                  background: "var(--tau-accent)",
                  color: "var(--tau-ink-inverse)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                重试
              </button>
              <button
                type="button"
                onClick={() => setBoot("ready")}
                style={{
                  padding: "6px 16px",
                  borderRadius: "var(--tau-radius-md)",
                  background: "var(--tau-bg-group)",
                  color: "var(--tau-ink-2)",
                  border: "none",
                  cursor: "pointer",
                }}
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
    <SurfaceProvider initialKey="home">
      <ShellLayout />
    </SurfaceProvider>
  );
}

function ShellLayout() {
  const { state } = useSurface();
  const collapsed = useShellStore(s => s.sidebarCollapsed);
  const width = useShellStore(s => s.sidebarWidth);
  const setWidth = useShellStore(s => s.setSidebarWidth);
  const toggle = useShellStore(s => s.toggleSidebar);

  return (
    <div
      className={collapsed ? "app collapsed" : "app"}
      style={{ ["--tau-sidebar-w" as string]: `${width}px` }}
    >
      <Sidebar />
      <SidebarResizer onResize={setWidth} onDoubleClick={toggle} />
      <div className="main">
        <Titlebar />
        <main className="content">
          <PageHost state={state} />
        </main>
        <footer className="statusbar" />
      </div>
    </div>
  );
}

/** 侧栏拖宽热区（模板：透明，hover/拖动显形；双击折叠）。 */
function SidebarResizer({
  onResize,
  onDoubleClick,
}: {
  onResize: (w: number) => void;
  onDoubleClick: () => void;
}) {
  const dragging = useRef<{ x: number; startW: number } | null>(null);

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
    document.querySelector(".resizer")?.classList.remove("active");
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
      className="resizer"
      title="拖动调整侧边栏宽度，双击折叠"
      onMouseDown={e => {
        // 起始宽度读 store（CSS 变量设在 .app 上且 :root 只有静态默认值，读ComputedStyle会拿错）
        dragging.current = { x: e.clientX, startW: useShellStore.getState().sidebarWidth };
        document.body.style.userSelect = "none";
        e.currentTarget.classList.add("active");
        e.preventDefault();
      }}
      onDoubleClick={onDoubleClick}
    />
  );
}
