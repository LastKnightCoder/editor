import React from "react";
import { cn } from "@tau/ui";
import { type MediaTone, mediaToneTrack } from "./MediaControls";
import { ScrubTooltip, useScrubber } from "./useScrubber";

export { TOOLTIP_HOVER_DELAY_MS } from "./useScrubber";

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
  /** 触屏：拖动圆点常显、触控区加高 */
  touch?: boolean;
  className?: string;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const BUFFER_CLASS: Record<MediaTone, string> = {
  surface: "bg-accent-soft",
  float: "bg-ink-inverse/20",
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
  touch = false,
  className,
}: ProgressBarProps) => {
  const scrubber = useScrubber({ onScrub, onCommit, onPointerValue });
  const { dragging } = scrubber;
  const shown = scrubber.shownValue(value);
  const colors = mediaToneTrack(tone);

  return (
    <div
      ref={scrubber.trackRef}
      className={cn(
        "group/slider relative flex cursor-pointer touch-none select-none items-center",
        touch ? "h-8" : "h-4",
        className
      )}
      {...scrubber.handlers}
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
            : touch
              ? "scale-100"
              : "scale-0 group-hover/slider:scale-100 group-focus-visible/slider:scale-100",
          colors.knob
        )}
        style={{ left: `calc(${shown * 100}% - 6px)` }}
      />
      {renderTooltip && scrubber.revealed && (
        <ScrubTooltip value={scrubber.pointerValue}>
          {renderTooltip(scrubber.pointerValue)}
        </ScrubTooltip>
      )}
    </div>
  );
};

export default ProgressBar;
