/**
 * 文章播客播放条（mockups/article-detail/plan-a4-quiet.html 定稿形态）：
 * surface 卡 + accent 播放圆钮 + 波形进度（点击/拖拽波形任意位置 seek）+ 播速循环。
 * 波形高度为确定性伪随机（seed = podcast.id），同一播客每次渲染一致。
 * TODO(后续补充，legacy PodcastPlayer 有、本版未带)：音量/静音、脚本详情、下载音频。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import type { IPodcast } from "@/types/podcast";
import useLocalPath from "@/hooks/useLocalPath";
import { IconButton, Spinner, cn, toast } from "@tau/ui";

const WAVE_BAR_COUNT = 48;
const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 0.75];

interface PodcastPlayerProps {
  podcast: IPodcast;
  /** 打开生成/编辑弹窗 */
  onEdit?: () => void;
  /** 移除播客（确认交互由调用方承担） */
  onDelete?: () => void;
  className?: string;
}

/** LCG 伪随机高度（0.25–1）：seed 固定则波形形状稳定 */
function seededHeights(seed: number, count: number): number[] {
  const heights: number[] = [];
  let state = seed || 1;
  for (let i = 0; i < count; i += 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    heights.push(0.25 + (state / 4294967296) * 0.75);
  }
  return heights;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function PodcastPlayer({ podcast, onEdit, onDelete, className }: PodcastPlayerProps) {
  const { localPath, loading } = useLocalPath(podcast.audioUrl, { mediaType: "audio" });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(podcast.duration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const bars = useMemo(() => seededHeights(podcast.id || 1, WAVE_BAR_COUNT), [podcast.id]);
  const playedRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  /* localPath 就绪/变更时重置播放态并显式 load（对齐 legacy：仅更新 src 属性
     存在浏览器不重载的边界，且换源后旧进度/播放态必须清掉） */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !localPath) return;
    setPlaying(false);
    setCurrentTime(0);
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // 换源瞬间 seek 可能抛错，忽略
    }
    audio.load();
  }, [localPath]);

  const syncTimeState = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime || 0);
    const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (dur > 0) setDuration(dur);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(error => {
        console.warn("[PodcastPlayer] 播放失败", error);
        toast.error(`播放失败：${error instanceof Error ? error.message : String(error)}`);
      });
    } else {
      audio.pause();
    }
  };

  /** 按指针在波形内的横向比例 seek（pointer capture 支持拖拽刮擦） */
  const seekFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const wave = waveRef.current;
    const audio = audioRef.current;
    if (!wave || !audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = wave.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setCurrentTime(audio.currentTime);
  };

  const handleWavePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromPointer(event);
  };

  const handleWavePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) seekFromPointer(event);
  };

  const handleWavePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const cyclePlaybackRate = () => {
    const next = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(playbackRate) + 1) % PLAYBACK_RATES.length];
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  if (loading) {
    return (
      <div
        className={cn(
          "shadow-card rounded-tau-md bg-surface flex h-[58px] items-center justify-center",
          className
        )}
      >
        <Spinner className="size-4" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "shadow-card rounded-tau-md bg-surface flex items-center gap-3 px-3.5 py-2.5",
        className
      )}
    >
      <audio
        ref={audioRef}
        src={localPath}
        className="hidden"
        preload="metadata"
        onLoadedMetadata={syncTimeState}
        onDurationChange={syncTimeState}
        onTimeUpdate={syncTimeState}
        onSeeking={syncTimeState}
        onSeeked={syncTimeState}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          console.warn("[PodcastPlayer] 音频加载失败", localPath);
          toast.error("音频加载失败，无法播放");
        }}
      />

      <button
        type="button"
        onClick={togglePlay}
        title={playing ? "暂停" : "播放"}
        aria-label={playing ? "暂停" : "播放"}
        className="bg-accent text-ink-inverse ease-tau-out hover:bg-accent-hover grid size-[34px] shrink-0 place-items-center rounded-full transition-colors duration-150"
      >
        {playing ? (
          <Pause className="size-[15px]" strokeWidth={1.75} fill="currentColor" />
        ) : (
          <Play className="size-[15px]" strokeWidth={1.75} fill="currentColor" />
        )}
      </button>

      <div className="min-w-0">
        <b className="block truncate text-[12.5px] font-semibold">{podcast.name || "未命名播客"}</b>
        <span className="text-tau-tiny text-ink-3">
          {podcast.speakers.map(speaker => speaker.name).join(" · ") || "播客"}
        </span>
      </div>

      <div
        ref={waveRef}
        role="slider"
        aria-label="播放进度"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        tabIndex={0}
        onPointerDown={handleWavePointerDown}
        onPointerMove={handleWavePointerMove}
        onPointerUp={handleWavePointerUp}
        onPointerCancel={handleWavePointerUp}
        className="flex h-[26px] min-w-0 flex-1 cursor-pointer touch-none items-center gap-[2px]"
      >
        {bars.map((height, index) => (
          <i
            key={index}
            style={{ height: `${height * 100}%` }}
            className={cn(
              "min-w-[1.5px] max-w-[3px] flex-1 rounded-full",
              playedRatio * WAVE_BAR_COUNT > index ? "bg-accent" : "bg-sunken"
            )}
          />
        ))}
      </div>

      <span className="text-tau-sm text-ink-2 shrink-0 tabular-nums">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <button
        type="button"
        onClick={cyclePlaybackRate}
        title="播放速度"
        className="text-tau-sm rounded-tau-sm text-ink-3 hover:bg-hover hover:text-ink-1 shrink-0 px-1.5 py-0.5 tabular-nums transition-colors duration-150"
      >
        {playbackRate}x
      </button>

      {/* 重生成 / 移除常显（A4 修订：不依赖 hover 显隐） */}
      <div className="flex shrink-0 gap-0.5">
        <IconButton title="重新生成 / 编辑" onClick={onEdit}>
          <RefreshCw className="size-[14px]" strokeWidth={1.75} />
        </IconButton>
        <IconButton title="移除播客" onClick={onDelete}>
          <Trash2 className="size-[14px]" strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}
