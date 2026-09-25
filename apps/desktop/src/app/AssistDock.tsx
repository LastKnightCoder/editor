/**
 * 右侧辅助栏（D-047 入口 A）—— 壳层第三块：标题栏之下、正文右侧的一张纸，
 * 当前住户是 AI 对话（features/chat 的 ChatDock）。
 *
 * 空间裁决见 assistLayout.ts：并排 → 正文不足时自动收起侧栏（关闭时还原）→
 * 仍不足则覆盖在正文之上（Esc 退场）。AI 对话页在栈顶时隐藏，避免同一会话出现两份。
 * 首次打开才挂载内容，之后保活（收起只隐藏，保留滚动位置与流式中的回答）。
 * 开合从右缘滑入滑出（右外边距补间，并排时正文随之让位）；与对话页之间的切换走
 * assistMorph 形变过渡，期间关掉滑动。
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import type { CSSProperties } from "react";
import { cn } from "@tau/ui";
import { usePage, useOverlayDismiss } from "@/page/PageProvider";
import { ChatDock } from "@/features/chat/components/ChatDock";
import { ASSIST_MAX_W, ASSIST_MIN_W, useShellStore } from "./shellStore";
import { resolveAssistLayout } from "./assistLayout";
import { ASSIST_MORPH_CLASS } from "./assistMorph";

/** 停靠栏不渲染的页面：页面本身就是对话 */
const HIDDEN_ON = new Set(["chat"]);
/** 滑入滑出时长，与侧栏宽度过渡同档 */
const SLIDE_MS = 220;

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

  // 定位按布局模式、Esc 按可见：退场滑动期间保持原定位，不在覆盖 / 并排间跳变
  const overlay = layout.mode === "overlay";
  useOverlayDismiss(() => setOpen(false), visible && overlay);

  // 首次打开才挂载（对话引擎体量大，不拖慢壳层启动），之后保活。
  // 渲染期派生而非 effect：形变过渡在 flushSync 内一次提交就要拿到停靠栏
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  // 对话流在滑出动画结束后才收起，退场过程中内容不闪空
  const [contentOpen, setContentOpen] = useState(visible);
  if (visible && !contentOpen) setContentOpen(true);
  useEffect(() => {
    if (visible) return;
    const timer = setTimeout(() => setContentOpen(false), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [visible]);
  if (!mounted) return null;

  return (
    <aside
      aria-label="AI 对话"
      aria-hidden={!visible}
      inert={!visible}
      style={{ width, ["--assist-w" as string]: `${width}px` } as CSSProperties}
      className={cn(
        "bg-surface rounded-tau-lg flex min-h-0 flex-none flex-col",
        "ease-tau-out transition-[margin,opacity,visibility] duration-[220ms]",
        // 首帧从收起态起滑；形变过渡期间一步到位
        "starting:mr-[calc(var(--assist-w)*-1)] starting:opacity-0",
        "[[data-assist-morph]_&]:transition-none",
        overlay
          ? "shadow-float absolute bottom-[18px] right-[18px] top-0 z-30 mr-0"
          : "shadow-card relative mb-[18px] mr-[18px]",
        // 收起：右外边距抵掉自身宽度，并排时不再占位，整体滑出右缘
        visible ? ASSIST_MORPH_CLASS : "invisible mr-[calc(var(--assist-w)*-1)] opacity-0"
      )}
    >
      <AssistResizer />
      <ChatDock open={contentOpen} onClose={() => setOpen(false)} />
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
        className={cn(
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
