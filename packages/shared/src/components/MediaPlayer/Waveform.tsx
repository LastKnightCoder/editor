import React, { useLayoutEffect, useMemo, useState } from "react";
import { cn } from "@tau/ui";
import { motion } from "motion/react";
import { resamplePeaks } from "./useAudioPeaks";
import { ScrubTooltip, useScrubber } from "./useScrubber";

/** 每根柱子占的横向步长（柱宽 + 间隙），柱数随可用宽度变化 */
const BAR_STEP = 4;

interface WaveformProps {
  /** 归一化峰值（0 - 1） */
  peaks: number[];
  /** 当前进度，0 - 1 */
  value: number;
  onScrub?: (value: number) => void;
  onCommit: (value: number) => void;
  renderTooltip?: (value: number) => React.ReactNode;
  className?: string;
}

/** 波形进度条：波形本身即进度，已播放部分染 accent，悬停出现竖线与时间气泡 */
const Waveform = ({ peaks, value, onScrub, onCommit, renderTooltip, className }: WaveformProps) => {
  const scrubber = useScrubber({ onScrub, onCommit });
  const shown = scrubber.shownValue(value);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const track = scrubber.trackRef.current;
    if (!track) {
      return;
    }
    setWidth(track.clientWidth);
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(track);
    return () => observer.disconnect();
  }, [scrubber.trackRef]);

  const bars = useMemo(
    () => resamplePeaks(peaks, Math.max(1, Math.floor(width / BAR_STEP))),
    [peaks, width]
  );
  const renderBars = (barClassName: string) =>
    bars.map((peak, index) => (
      <i
        key={index}
        className={cn("min-w-px flex-1 rounded-full", barClassName)}
        style={{ height: `${peak * 100}%` }}
      />
    ));

  return (
    <motion.div
      ref={scrubber.trackRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className={cn("relative h-10 cursor-pointer touch-none select-none", className)}
      role="slider"
      aria-label="播放进度"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
      {...scrubber.handlers}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center gap-[1.5px]"
      >
        {renderBars("bg-track")}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center gap-[1.5px]"
        style={{ clipPath: `inset(0 ${(1 - shown) * 100}% 0 0)` }}
      >
        {renderBars("bg-accent")}
      </div>
      {(scrubber.hovering || scrubber.dragging) && (
        <span
          aria-hidden
          className="bg-ink-2/50 pointer-events-none absolute inset-y-0 w-px"
          style={{ left: `${scrubber.pointerValue * 100}%` }}
        />
      )}
      {renderTooltip && scrubber.revealed && (
        <ScrubTooltip value={scrubber.pointerValue} className="mb-1.5">
          {renderTooltip(scrubber.pointerValue)}
        </ScrubTooltip>
      )}
    </motion.div>
  );
};

export default Waveform;
