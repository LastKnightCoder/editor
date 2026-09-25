/**
 * 右侧辅助栏（D-047 入口 A）—— 壳层第三块：标题栏之下、正文右侧的一张纸，
 * 当前住户是 AI 对话（features/chat 的 ChatDock）。
 *
 * 空间裁决见 assistLayout.ts：并排 → 正文不足时自动收起侧栏（关闭时还原）→
 * 仍不足则覆盖在正文之上（Esc 退场）。AI 对话页在栈顶时隐藏，避免同一会话出现两份。
 * 首次打开才挂载内容，之后保活（收起只隐藏，保留滚动位置与流式中的回答）。
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import clsx from "clsx";
import { usePage, useOverlayDismiss } from "@/page/PageProvider";
import { ChatDock } from "@/features/chat/components/ChatDock";
import { ASSIST_MAX_W, ASSIST_MIN_W, useShellStore } from "./shellStore";
import { resolveAssistLayout } from "./assistLayout";

/** 停靠栏不渲染的页面：页面本身就是对话 */
const HIDDEN_ON = new Set(["chat"]);

export function AssistDock() {
  const { state } = usePage();
  const currentKey = state.back[state.back.length - 1]?.key;
  const open = useShellStore(s => s.assistOpen);
  const width = useShellStore(s => s.assistWidth);
  const sidebarWidth = useShellStore(s => s.sidebarWidth);
  const sidebarCollapsed = useShellStore(s => s.sidebarCollapsed);
  const setOpen = useShellStore(s => s.setAssistOpen);
  const visible = open && !HIDDEN_ON.has(currentKey ?? "");

  const windowWidth = useWindowWidth();
  const layout = resolveAssistLayout({
    windowWidth,
    sidebarWidth,
    sidebarCollapsed,
    assistWidth: width,
  });

  // 自动收起 / 还原侧栏只在「打开、关闭、窗口或栏宽变化」时裁决：
  // 不随侧栏状态重跑——用户打开辅助栏后手动展开侧栏，尊重用户选择
  useEffect(() => {
    const shell = useShellStore.getState();
    if (visible) {
      const next = resolveAssistLayout({
        windowWidth,
        sidebarWidth: shell.sidebarWidth,
        sidebarCollapsed: shell.sidebarCollapsed,
        assistWidth: width,
      });
      if (next.collapseSidebar)
        useShellStore.setState({ sidebarCollapsed: true, sidebarAutoCollapsed: true });
    } else if (shell.sidebarAutoCollapsed) {
      useShellStore.setState({ sidebarCollapsed: false, sidebarAutoCollapsed: false });
    }
  }, [visible, windowWidth, width]);

  const overlay = visible && layout.mode === "overlay";
  useOverlayDismiss(() => setOpen(false), overlay);

  // 首次打开才挂载（对话引擎体量大，不拖慢壳层启动），之后保活
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);
  if (!mounted) return null;

  return (
    <aside
      aria-label="AI 对话"
      aria-hidden={!visible}
      style={{ width }}
      className={clsx(
        "bg-surface rounded-tau-lg flex min-h-0 flex-none flex-col",
        !visible && "hidden",
        overlay
          ? "shadow-float absolute bottom-[18px] right-[18px] top-0 z-30"
          : "shadow-card relative mb-[18px] mr-[18px]"
      )}
    >
      <AssistResizer />
      <ChatDock open={visible} onClose={() => setOpen(false)} />
    </aside>
  );
}

/** 左缘拖宽热区（透明，hover / 拖动时显出 accent 短线） */
function AssistResizer() {
  const width = useShellStore(s => s.assistWidth);
  const setWidth = useShellStore(s => s.setAssistWidth);
  const dragging = useRef<{ x: number; startW: number } | null>(null);
  const [active, setActive] = useState(false);

  const endDrag = useCallback(() => {
    dragging.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    setActive(false);
  }, []);

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const drag = dragging.current;
      if (drag) setWidth(drag.startW + drag.x - e.clientX);
    },
    [setWidth]
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="AI 对话栏宽度"
      aria-valuemin={ASSIST_MIN_W}
      aria-valuemax={ASSIST_MAX_W}
      aria-valuenow={width}
      tabIndex={0}
      title="拖动调整 AI 对话栏宽度"
      className="group absolute -left-2 bottom-4 top-4 z-10 w-2 cursor-col-resize focus-visible:shadow-[var(--tau-focus-ring)]"
      onKeyDown={e => {
        // 键盘等价调整：左右箭头 ±16px，配合 focus-ring 可见
        const step = e.key === "ArrowLeft" ? 16 : e.key === "ArrowRight" ? -16 : 0;
        if (step === 0) return;
        e.preventDefault();
        setWidth(Math.min(ASSIST_MAX_W, Math.max(ASSIST_MIN_W, width + step)));
      }}
      onPointerDown={e => {
        dragging.current = { x: e.clientX, startW: useShellStore.getState().assistWidth };
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
        setActive(true);
        e.preventDefault();
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onLostPointerCapture={endDrag}
    >
      <span
        aria-hidden
        className={clsx(
          "ease-tau-out absolute left-[3px] top-1/2 -mt-[18px] h-9 w-0.5 rounded-full transition-colors duration-[160ms]",
          active ? "bg-accent" : "group-hover:bg-accent bg-transparent"
        )}
      />
    </div>
  );
}

function useWindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}
