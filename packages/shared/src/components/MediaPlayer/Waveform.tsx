import React, { useLayoutEffect, useMemo, useState } from "react";
import { cn } from "@tau/ui";
import { motion } from "motion/react";
import { resamplePeaks } from "./useAudioPeaks";
import { ScrubTooltip, useScrubber } from "./useScrubber";
import { segmentToneAt, type WaveformSegment } from "./waveformSegments";

/** 每根柱子占的横向步长（柱宽 + 间隙），柱数随可用宽度变化 */
const BAR_STEP = 4;

/** 已播放 / 未播放两态的分段色；类名须静态书写，Tailwind 才能生成 */
const SEGMENT_TONE_CLASSES: Record<WaveformSegment["tone"], { played: string; rest: string }> = {
  1: { played: "bg-tag-1", rest: "bg-tag-1/30" },
  2: { played: "bg-tag-2", rest: "bg-tag-2/30" },
  3: { played: "bg-tag-3", rest: "bg-tag-3/30" },
  4: { played: "bg-tag-4", rest: "bg-tag-4/30" },
  5: { played: "bg-tag-5", rest: "bg-tag-5/30" },
};

interface WaveformProps {
  /** 归一化峰值（0 - 1） */
  peaks: number[];
  /** 当前进度，0 - 1 */
  value: number;
  onScrub?: (value: number) => void;
  onCommit: (value: number) => void;
  renderTooltip?: (value: number) => React.ReactNode;
  /** 分段着色；不传时整条波形用 accent */
  segments?: WaveformSegment[];
  className?: string;
}

/** 波形进度条：波形本身即进度，已播放部分染 accent（或分段色），悬停出现竖线与时间气泡 */
const Waveform = ({
  peaks,
  value,
  onScrub,
  onCommit,
  renderTooltip,
  segments,
  className,
}: WaveformProps) => {
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
  const tones = useMemo(
    () =>
      segments?.length
        ? bars.map((_, index) => segmentToneAt(segments, (index + 0.5) / bars.length))
        : null,
    [bars, segments]
  );
  const renderBars = (played: boolean) =>
    bars.map((peak, index) => {
      const tone = tones?.[index];
      const toneClass = tone
        ? SEGMENT_TONE_CLASSES[tone][played ? "played" : "rest"]
        : played
          ? "bg-accent"
          : "bg-track";
      return (
        <i
          key={index}
          className={cn("min-w-px flex-1 rounded-full", toneClass)}
          style={{ height: `${peak * 100}%` }}
        />
      );
    });

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
        {renderBars(false)}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center gap-[1.5px]"
        style={{ clipPath: `inset(0 ${(1 - shown) * 100}% 0 0)` }}
      >
        {renderBars(true)}
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
