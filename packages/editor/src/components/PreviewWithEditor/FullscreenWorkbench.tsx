import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@tau/ui";
import { useMemoizedFn } from "ahooks";
import { PortalToBody } from "@tau/shared";
import { Minus, PanelLeft, Plus, Scan, X, type LucideIcon } from "lucide-react";

import { ToolbarDivider, ToolbarIconButton } from "../FloatingToolbar";
import { panAroundAnchor, pointFromCenter, type Point } from "../../utils/zoomPan";
import { ErrorBar, KindLabel } from "./parts";
import type { PreviewError } from "./previewError";

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.25;
/** 指针移动超过该距离才算拖动，画布里的链接、按钮仍可点击 */
const DRAG_THRESHOLD = 3;
const FIT_PADDING = 48;

const clampZoom = (zoom: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

const isTypingTarget = (target: EventTarget) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || !!target.closest("input, textarea, select, .CodeMirror"));

const isInteractiveTarget = (target: EventTarget) =>
  target instanceof HTMLElement && !!target.closest("button, a, input, textarea, select, label");

interface FullscreenWorkbenchProps {
  title: string;
  icon: LucideIcon;
  readOnly: boolean;
  showSource: boolean;
  onToggleSource: () => void;
  /** 源码栏内容（CodeMirror 由外层持有，收起时保持挂载） */
  source: ReactNode;
  error: PreviewError | null;
  onClose: () => void;
  children: ReactNode;
}

/**
 * 全屏工作台：左源码 / 右画布。画布滚轮以指针为锚缩放、拖动平移，
 * + − 0 缩放与适应（源码输入时不响应），Esc 关闭（焦点链内处理，不冒泡给宿主的 Esc 仲裁）。
 */
const FullscreenWorkbench = ({
  title,
  icon,
  readOnly,
  showSource,
  onToggleSource,
  source,
  error,
  onClose,
  children,
}: FullscreenWorkbenchProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ start: Point; origin: Point; moved: boolean } | null>(null);

  const zoomAt = useMemoizedFn((nextZoom: number, anchor: Point = { x: 0, y: 0 }) => {
    const target = clampZoom(nextZoom);
    setPan(panAroundAnchor(pan, zoom, target, anchor));
    setZoom(target);
  });

  // 适应：按舞台可视区把内容等比缩放到恰好放下，并回到中心
  const fit = useMemoizedFn(() => {
    const stage = stageRef.current;
    const content = contentRef.current;
    if (!stage || !content || !content.offsetWidth || !content.offsetHeight) return;
    setZoom(
      clampZoom(
        Math.min(
          (stage.clientWidth - FIT_PADDING) / content.offsetWidth,
          (stage.clientHeight - FIT_PADDING) / content.offsetHeight
        )
      )
    );
    setPan({ x: 0, y: 0 });
  });

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  // React 的 wheel 是 passive 的，拦截页面滚动需要原生监听
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002));
      zoomAt(zoom * factor, pointFromCenter(stage, event));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [zoom, zoomAt]);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    const handled = (() => {
      if (event.key === "Escape") {
        onClose();
        return true;
      }
      if (isTypingTarget(event.target)) return false;
      switch (event.key) {
        case "+":
        case "=":
          zoomAt(zoom * ZOOM_STEP);
          return true;
        case "-":
          zoomAt(zoom / ZOOM_STEP);
          return true;
        case "0":
          fit();
          return true;
        default:
          return false;
      }
    })();
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <PortalToBody>
      <div
        className="fixed inset-0 z-[1001] flex bg-[var(--ed-overlay)] px-[4vw] py-[4vh] text-[16px]"
        onClick={onClose}
      >
        <div
          ref={rootRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={`${title} 全屏`}
          className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-[var(--ed-bg-surface)] text-[var(--ed-text)] shadow-[var(--ed-shadow-float)] outline-none"
          onClick={e => e.stopPropagation()}
          onKeyDown={handleKeyDown}
        >
          <div className="flex h-[46px] shrink-0 items-center gap-[2px] border-b border-[var(--ed-border)] pl-[18px] pr-[10px] text-[14px]">
            <span className="mr-auto">
              <KindLabel icon={icon} title={title} />
            </span>
            <ToolbarIconButton
              icon={Minus}
              title="缩小 (−)"
              onClick={() => zoomAt(zoom / ZOOM_STEP)}
            />
            <span className="min-w-[3.4em] select-none text-center font-[family-name:var(--ed-font-mono)] text-[12px] tabular-nums text-[var(--ed-text-secondary)]">
              {Math.round(zoom * 100)}%
            </span>
            <ToolbarIconButton
              icon={Plus}
              title="放大 (+)"
              onClick={() => zoomAt(zoom * ZOOM_STEP)}
            />
            <ToolbarIconButton icon={Scan} title="适应窗口 (0)" onClick={fit} />
            {!readOnly && (
              <>
                <ToolbarDivider />
                <ToolbarIconButton
                  icon={PanelLeft}
                  title={showSource ? "收起源码" : "显示源码"}
                  active={showSource}
                  onClick={onToggleSource}
                />
              </>
            )}
            <ToolbarIconButton icon={X} title="关闭 (Esc)" onClick={onClose} />
          </div>
          <div className="flex min-h-0 flex-1">
            <div
              className={cn(
                "min-w-0 overflow-auto bg-[var(--ed-code-bg)]",
                showSource ? "w-[38%] min-w-[260px] border-r border-[var(--ed-border)]" : "hidden"
              )}
            >
              {source}
            </div>
            <div
              ref={stageRef}
              className={cn(
                "relative min-w-0 flex-1 touch-none overflow-hidden bg-[var(--ed-bg-page)] bg-[radial-gradient(var(--ed-border)_1px,transparent_1.2px)] bg-[length:18px_18px]",
                dragging ? "cursor-grabbing" : "cursor-grab"
              )}
              onPointerDown={event => {
                if (event.button !== 0 || isInteractiveTarget(event.target)) return;
                dragRef.current = {
                  start: { x: event.clientX, y: event.clientY },
                  origin: pan,
                  moved: false,
                };
              }}
              onPointerMove={event => {
                const drag = dragRef.current;
                if (!drag) return;
                const dx = event.clientX - drag.start.x;
                const dy = event.clientY - drag.start.y;
                if (!drag.moved) {
                  if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
                  drag.moved = true;
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  setDragging(true);
                }
                setPan({ x: drag.origin.x + dx, y: drag.origin.y + dy });
              }}
              onPointerUp={() => {
                dragRef.current = null;
                setDragging(false);
              }}
              onPointerCancel={() => {
                dragRef.current = null;
                setDragging(false);
              }}
            >
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  ref={contentRef}
                  className={cn(
                    "pointer-events-auto",
                    dragging
                      ? "select-none"
                      : "transition-transform duration-200 ease-[var(--tau-ease-out)]"
                  )}
                  style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                >
                  {children}
                </div>
              </div>
              {error && (
                <div className="absolute inset-x-0 bottom-0">
                  <ErrorBar message={error.message} stale={error.stale} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PortalToBody>
  );
};

export default FullscreenWorkbench;
