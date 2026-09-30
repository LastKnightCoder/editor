import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@tau/ui";

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** 悬停停留多久才出气泡：指针只是路过进度条时不闪一下；拖动时立即显示 */
export const TOOLTIP_HOVER_DELAY_MS = 400;

interface ScrubberOptions {
  /** 拖动中的预览回调，只更新视觉不落媒体元素 */
  onScrub?: (value: number) => void;
  /** 点击 / 松手定档回调 */
  onCommit: (value: number) => void;
  /** 气泡显示期间的指针位置（气泡收起时为 null），供帧预览按需取帧 */
  onPointerValue?: (value: number | null) => void;
}

/**
 * 横向拖动定位的交互内核（进度条、波形共用）：按下即拖、松手定档，
 * 悬停停留 TOOLTIP_HOVER_DELAY_MS 后才揭示气泡，拖动时立即揭示。
 */
export function useScrubber({ onScrub, onCommit, onPointerValue }: ScrubberOptions) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [hoverRevealed, setHoverRevealed] = useState(false);
  const [hoverValue, setHoverValue] = useState(0);
  const hoverValueRef = useRef(0);
  const hoverTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(hoverTimerRef.current), []);

  const valueAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) {
      return 0;
    }
    return clamp((clientX - rect.left) / rect.width);
  };

  const handlers = {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      const next = valueAt(event.clientX);
      setDragging(true);
      setDragValue(next);
      onScrub?.(next);
      onPointerValue?.(next);
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
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
    },
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) {
        return;
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setDragging(false);
      onCommit(valueAt(event.clientX));
    },
    onPointerCancel: () => setDragging(false),
    onPointerEnter: () => {
      setHovering(true);
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = window.setTimeout(() => {
        setHoverRevealed(true);
        onPointerValue?.(hoverValueRef.current);
      }, TOOLTIP_HOVER_DELAY_MS);
    },
    onPointerLeave: () => {
      setHovering(false);
      window.clearTimeout(hoverTimerRef.current);
      setHoverRevealed(false);
      if (!dragging) {
        onPointerValue?.(null);
      }
    },
  };

  return {
    trackRef,
    handlers,
    dragging,
    hovering,
    /** 显示用的进度：拖动中跟随指针，否则取外部值 */
    shownValue: (value: number) => (dragging ? dragValue : clamp(value)),
    /** 指针所在位置（拖动 / 悬停） */
    pointerValue: clamp(dragging ? dragValue : hoverValue),
    /** 气泡是否揭示（悬停停留足够久或正在拖动） */
    revealed: hoverRevealed || dragging,
  };
}

/** 进度气泡：按实际宽度夹在轨道两端之内，避免被外层圆角容器裁掉 */
export function ScrubTooltip({
  value,
  className,
  children,
}: {
  value: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [halfWidth, setHalfWidth] = useState(0);
  useLayoutEffect(() => {
    if (ref.current) {
      setHalfWidth(ref.current.offsetWidth / 2);
    }
  }, [value, children]);
  return (
    <div
      ref={ref}
      className={cn(
        "bg-ink-1 text-ink-inverse rounded-tau-sm shadow-float pointer-events-none absolute bottom-full z-30 mb-2.5 -translate-x-1/2 whitespace-nowrap p-1",
        className
      )}
      style={{
        left: `clamp(${halfWidth}px, ${value * 100}%, calc(100% - ${halfWidth}px))`,
      }}
    >
      {children}
    </div>
  );
}
