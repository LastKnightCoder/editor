import React, { useRef, useState } from "react";
import classNames from "classnames";

interface ProgressBarProps {
  /** 当前值，0 - 1 */
  value: number;
  /** 已缓冲比例，0 - 1，不传则不显示缓冲层 */
  buffered?: number;
  /** 拖动中的预览回调，只更新视觉不落媒体元素 */
  onScrub?: (value: number) => void;
  /** 点击 / 松手定档回调 */
  onCommit: (value: number) => void;
  /** 悬停提示渲染（进度条的时间气泡），不传则无 */
  renderTooltip?: (value: number) => React.ReactNode;
  /** dark: 浮于视频画面（白色系）；light: 普通表面（强调色填充） */
  tone?: "dark" | "light";
  className?: string;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const ProgressBar = ({
  value,
  buffered,
  onScrub,
  onCommit,
  renderTooltip,
  tone = "dark",
  className,
}: ProgressBarProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [hoverValue, setHoverValue] = useState(0);

  const shown = dragging ? dragValue : clamp(value);

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
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) {
      setHoverValue(valueAt(event.clientX));
      return;
    }
    const next = valueAt(event.clientX);
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

  const dark = tone === "dark";

  return (
    <div
      ref={trackRef}
      className={classNames(
        "group/slider relative flex h-4 cursor-pointer touch-none select-none items-center",
        className
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDragging(false)}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
    >
      <div
        className={classNames(
          "pointer-events-none absolute inset-x-0 h-1 overflow-hidden rounded-full transition-[height] duration-200 group-hover/slider:h-1.5",
          dark ? "bg-white/25" : "bg-gray-200 dark:bg-zinc-700"
        )}
      >
        {buffered != null && buffered > 0 && (
          <div
            className={classNames(
              "absolute inset-y-0 left-0 rounded-full",
              dark ? "bg-white/35" : "bg-gray-300 dark:bg-zinc-600"
            )}
            style={{ width: `${clamp(Math.max(buffered, shown)) * 100}%` }}
          />
        )}
        <div
          className={classNames(
            "absolute inset-y-0 left-0 rounded-full",
            dark ? "bg-white" : "bg-gray-800 dark:bg-zinc-300"
          )}
          style={{ width: `${shown * 100}%` }}
        />
      </div>
      <span
        aria-hidden
        className={classNames(
          "pointer-events-none absolute size-3 rounded-full bg-white transition-transform duration-150",
          dragging
            ? "scale-110"
            : "scale-0 group-hover/slider:scale-100 group-focus-visible/slider:scale-100",
          dark
            ? "shadow-[0_1px_2px_rgba(0,0,0,0.35),0_0_0_2px_rgba(0,0,0,0.3)]"
            : "shadow-[0_1px_2px_rgba(0,0,0,0.15),0_0_0_2px_#1f2937] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_0_0_2px_#d4d4d8]"
        )}
        style={{ left: `calc(${shown * 100}% - 6px)` }}
      />
      {renderTooltip && (hovering || dragging) && (
        <div
          className="pointer-events-none absolute bottom-full z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/85 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-white shadow-lg"
          style={{
            left: `${clamp(dragging ? dragValue : hoverValue) * 100}%`,
          }}
        >
          {renderTooltip(clamp(dragging ? dragValue : hoverValue))}
        </div>
      )}
    </div>
  );
};

export default ProgressBar;
