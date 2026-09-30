import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@tau/ui";
import { type MediaTone, mediaToneTrack } from "./MediaControls";

interface ProgressBarProps {
  /** 当前值，0 - 1 */
  value: number;
  /** 已缓冲比例，0 - 1，不传则不显示缓冲层 */
  buffered?: number;
  /** 拖动中的预览回调，只更新视觉不落媒体元素 */
  onScrub?: (value: number) => void;
  /** 点击 / 松手定档回调 */
  onCommit: (value: number) => void;
  /** 气泡显示期间的指针位置（气泡收起时为 null），供帧预览按需取帧 */
  onPointerValue?: (value: number | null) => void;
  /** 悬停气泡内容（时间 / 帧预览），不传则无气泡 */
  renderTooltip?: (value: number) => React.ReactNode;
  tone?: MediaTone;
  /** 轨道直角：进度条横贯容器边缘（如贴在画面与底栏的接缝上）时使用 */
  square?: boolean;
  className?: string;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** 悬停停留多久才出气泡：指针只是路过进度条时不闪一下；拖动时立即显示 */
export const TOOLTIP_HOVER_DELAY_MS = 400;

const BUFFER_CLASS: Record<MediaTone, string> = {
  surface: "bg-accent-soft",
  float: "bg-ink-inverse/20",
  light: "bg-gray-300 dark:bg-zinc-600",
};

const ProgressBar = ({
  value,
  buffered,
  onScrub,
  onCommit,
  onPointerValue,
  renderTooltip,
  tone = "surface",
  square = false,
  className,
}: ProgressBarProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);
  const [hoverRevealed, setHoverRevealed] = useState(false);
  const [hoverValue, setHoverValue] = useState(0);
  const hoverValueRef = useRef(0);
  const hoverTimerRef = useRef<number | undefined>(undefined);
  const [tooltipHalfWidth, setTooltipHalfWidth] = useState(0);

  const shown = dragging ? dragValue : clamp(value);
  const pointerValue = clamp(dragging ? dragValue : hoverValue);
  const tooltipVisible = !!renderTooltip && (hoverRevealed || dragging);

  useEffect(() => () => window.clearTimeout(hoverTimerRef.current), []);
  const colors = mediaToneTrack(tone);

  // 气泡按实际宽度夹在轨道两端之内，避免被外层圆角容器裁掉
  useLayoutEffect(() => {
    if (tooltipVisible && tooltipRef.current) {
      setTooltipHalfWidth(tooltipRef.current.offsetWidth / 2);
    }
  }, [tooltipVisible, pointerValue]);

  const valueAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) {
      return 0;
    }
    return clamp((clientX - rect.left) / rect.width);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = valueAt(event.clientX);
    setDragging(true);
    setDragValue(next);
    onScrub?.(next);
    onPointerValue?.(next);
  };

  const handlePointerEnter = () => {
    window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      setHoverRevealed(true);
      onPointerValue?.(hoverValueRef.current);
    }, TOOLTIP_HOVER_DELAY_MS);
  };

  const handlePointerLeave = () => {
    window.clearTimeout(hoverTimerRef.current);
    setHoverRevealed(false);
    if (!dragging) {
      onPointerValue?.(null);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const next = valueAt(event.clientX);
    if (!dragging) {
      hoverValueRef.current = next;
      setHoverValue(next);
      if (hoverRevealed) {
        onPointerValue?.(next);
      }
      return;
    }
    onPointerValue?.(next);
    setDragValue(next);
    onScrub?.(next);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    onCommit(valueAt(event.clientX));
  };

  return (
    <div
      ref={trackRef}
      className={cn(
        "group/slider relative flex h-4 cursor-pointer touch-none select-none items-center",
        className
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDragging(false)}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 h-1 overflow-hidden transition-[height] duration-200 group-hover/slider:h-1.5",
          !square && "rounded-full",
          dragging && "h-1.5",
          colors.track
        )}
      >
        {buffered != null && buffered > 0 && (
          <div
            className={cn("absolute inset-y-0 left-0", BUFFER_CLASS[tone])}
            style={{ width: `${clamp(Math.max(buffered, shown)) * 100}%` }}
          />
        )}
        <div
          className={cn("absolute inset-y-0 left-0", !square && "rounded-full", colors.fill)}
          style={{ width: `${shown * 100}%` }}
        />
      </div>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute size-3 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform duration-150",
          dragging
            ? "scale-110"
            : "scale-0 group-hover/slider:scale-100 group-focus-visible/slider:scale-100",
          colors.knob
        )}
        style={{ left: `calc(${shown * 100}% - 6px)` }}
      />
      {tooltipVisible && (
        <div
          ref={tooltipRef}
          className="bg-ink-1 text-ink-inverse rounded-tau-sm shadow-float pointer-events-none absolute bottom-full z-30 mb-2.5 -translate-x-1/2 whitespace-nowrap p-1"
          style={{
            left: `clamp(${tooltipHalfWidth}px, ${pointerValue * 100}%, calc(100% - ${tooltipHalfWidth}px))`,
          }}
        >
          {renderTooltip(pointerValue)}
        </div>
      )}
    </div>
  );
};

export default ProgressBar;
