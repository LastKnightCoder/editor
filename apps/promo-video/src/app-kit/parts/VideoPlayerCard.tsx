/**
 * 视频笔记左栏的播放器卡片，结构摘自 packages/shared/src/components/MediaPlayer（VideoPlayer + ProgressBar）。
 * 画面区是代码画的讲座幻灯片；进度条按章节分段，下面是笔记刻度（时间戳空心圆点、摘录实心圆点、截帧方块）。
 */
import clsx from "clsx";
import { Check, Maximize, Pause, PictureInPicture2, Play, Volume2 } from "lucide-react";
import { SpinnerLook } from "./FormLook";
import { LectureFrame } from "./LectureSlide";
import type { SlideKind } from "../../mock/videonote";

export type MarkerKind = "timestamp" | "quote" | "screenshot";

export const MARKER_LABEL: Record<MarkerKind, string> = { timestamp: "时间戳", quote: "摘录", screenshot: "截帧" };

/** 播放器的时间：m:ss，满一小时 h:mm:ss */
export function playerTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h ? `${h}:` : ""}${h ? String(m).padStart(2, "0") : m}:${String(s).padStart(2, "0")}`;
}

const CONTROL = "text-ink-2 grid size-[30px] shrink-0 place-items-center";

export function VideoPlayerCard({
  time,
  duration,
  playing,
  slide,
  slideElapsed,
  subtitle,
  subtitleMounted,
  chapters,
  markers,
  markerHover,
  flash,
}: {
  /** 当前播放位置（秒） */
  time: number;
  duration: number;
  playing: boolean;
  slide: SlideKind;
  /** 这一页幻灯片已播了几秒（页内元素逐个出现） */
  slideElapsed?: number;
  /** 挂载字幕时叠在画面上的当前这一句 */
  subtitle?: string;
  subtitleMounted?: number;
  /** 章节：起点为秒 */
  chapters: { start: number; title: string }[];
  markers: { time: number; kind: MarkerKind; appear: number; text?: string; note: string }[];
  /** 悬停预览第几个刻度（appear 0→1） */
  markerHover?: { index: number; appear: number };
  /** 截帧时画面白闪 0→1→0 */
  flash?: number;
}) {
  const pct = Math.min(1, time / duration) * 100;
  const chapter = [...chapters].reverse().find(c => c.start <= time);
  const hasMarkers = markers.length > 0;
  return (
    <div className="rounded-tau-md bg-surface shadow-card relative w-full overflow-hidden select-none">
      <div data-hit="player" className="relative aspect-video w-full overflow-hidden bg-black">
        <LectureFrame kind={slide} elapsed={slideElapsed} subtitle={subtitle} mounted={subtitleMounted} />
        {flash ? <div className="absolute inset-0 bg-white" style={{ opacity: Math.max(0, flash) }} /> : null}
        {!playing && (
          <button type="button" data-hit="play" className="absolute inset-0 grid cursor-pointer place-items-center">
            <span className="shadow-float bg-surface text-accent-text grid size-14 place-items-center rounded-full">
              <Play className="translate-x-0.5" size={22} fill="currentColor" strokeWidth={1.75} />
            </span>
          </button>
        )}
      </div>
      <div data-hit="controls" className={clsx("@container relative flex shrink-0 items-center gap-0.5 px-2", hasMarkers ? "h-[54px] pt-3" : "h-12 pt-1")}>
        {/* 进度条：章节交界处留一道底色的缝 */}
        <div className="bg-track absolute inset-x-0 -top-1.5 h-1">
          <div className="bg-accent h-full" style={{ width: `${pct}%` }} />
          {chapters
            .filter(c => c.start > 0)
            .map(c => (
              <span key={c.start} className="bg-surface absolute inset-y-0 w-0.5 -translate-x-1/2" style={{ left: `${Math.min(1, c.start / duration) * 100}%` }} />
            ))}
          <span className="bg-accent absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.3)]" style={{ left: `${pct}%` }} />
        </div>
        {markers.map((marker, i) => {
          const pop = marker.appear;
          return (
            <span
              key={i}
              data-hit={`marker:${i}`}
              className="absolute top-1.5 z-10 grid h-3 w-3.5 -translate-x-1/2 place-items-center"
              style={{ left: `${Math.min(1, marker.time / duration) * 100}%`, opacity: Math.min(1, pop * 2), transform: `translateX(-50%) scale(${0.4 + 0.6 * pop})` }}
            >
              <span
                className={clsx(
                  "size-[7px] shadow-[inset_0_0_0_1.5px_var(--tau-accent-text)]",
                  marker.kind === "screenshot" ? "rounded-[2px]" : "rounded-full",
                  marker.kind === "quote" ? "bg-accent-text" : "bg-surface"
                )}
              />
            </span>
          );
        })}
        {markerHover && markerHover.appear > 0 && markers[markerHover.index] && (
          <div
            className="bg-surface text-ink-1 shadow-float rounded-tau-sm text-tau-sm pointer-events-none absolute bottom-[calc(100%-4px)] z-30 w-[220px] -translate-x-1/2 px-2.5 py-2 leading-relaxed"
            style={{ left: `clamp(110px, ${Math.min(1, markers[markerHover.index].time / duration) * 100}%, calc(100% - 110px))`, opacity: markerHover.appear }}
          >
            <span className="font-tau-mono text-accent-text mr-1.5">{playerTime(markers[markerHover.index].time)}</span>
            {markers[markerHover.index].text || MARKER_LABEL[markers[markerHover.index].kind]}
            <span className="text-ink-3 text-tau-micro mt-0.5 block">
              {MARKER_LABEL[markers[markerHover.index].kind]} · {markers[markerHover.index].note}
            </span>
          </div>
        )}
        <span data-hit="play" className="bg-accent text-ink-inverse grid size-[30px] shrink-0 place-items-center rounded-full">
          {playing ? <Pause size={14} fill="currentColor" strokeWidth={1.75} /> : <Play size={14} fill="currentColor" strokeWidth={1.75} />}
        </span>
        <span className="font-tau-mono text-tau-sm text-ink-2 ml-2 shrink-0">
          <span className="text-ink-1 font-medium">{playerTime(time)}</span> / {playerTime(duration)}
        </span>
        <span className="text-ink-3 text-tau-sm ml-3.5 min-w-0 flex-1 truncate">{chapter?.title}</span>
        <span className={CONTROL}>
          <Volume2 size={15} strokeWidth={1.75} />
        </span>
        <span className="font-tau-mono text-tau-sm flex h-[26px] shrink-0 items-center px-2">1×</span>
        <span className={CONTROL}>
          <PictureInPicture2 size={15} strokeWidth={1.75} />
        </span>
        <span className={CONTROL}>
          <Maximize size={15} strokeWidth={1.75} />
        </span>
      </div>
    </div>
  );
}

/** 视频还没缓存好：16:9 的凹底框里是缓存进度（components/VideoSourceLoader） */
export function CacheLoader({ source, progress, done, appear = 1 }: { source: string; progress: number; done?: number; appear?: number }) {
  const finished = (done ?? 0) >= 1;
  const bytes = (mb: number) => (mb < 1 ? `${Math.round(mb * 1024)} KB` : `${mb.toFixed(1)} MB`);
  const tracks = [
    { label: "视频", total: 182.4 },
    { label: "音频", total: 24.6 },
  ];
  return (
    <div data-hit="cache" className="rounded-tau-md bg-sunken relative aspect-video w-full overflow-hidden">
      <div className="flex h-full min-h-[220px] w-full items-center justify-center px-8 py-6" style={{ opacity: appear }}>
        <div className="flex w-full max-w-[360px] flex-col gap-5">
          <div className="flex items-center gap-3">
            <span className={clsx("grid size-8 shrink-0 place-items-center rounded-full", finished ? "bg-ok-soft text-ok" : "bg-accent-soft")}>
              {finished ? <Check size={16} strokeWidth={2} /> : <SpinnerLook />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-tau-body text-ink-1 truncate font-medium">{finished ? "视频已就绪" : `正在缓存 ${source} 视频`}</div>
              {!finished && <div className="text-tau-sm text-ink-3 truncate">{progress <= 0 ? "正在获取视频信息…" : "正在下载视频…"}</div>}
            </div>
          </div>
          {!finished &&
            progress > 0 &&
            tracks.map(track => (
              <div key={track.label} className="flex flex-col gap-1.5">
                <div className="text-tau-sm flex items-baseline justify-between gap-3">
                  <span className="text-ink-2">{track.label}</span>
                  <span className="text-ink-3 font-tau-mono tabular-nums">
                    {bytes(track.total * Math.min(1, progress))} / {bytes(track.total)}
                  </span>
                </div>
                <div role="progressbar" className="bg-ink-3/30 h-1 overflow-hidden rounded-full">
                  <div className="bg-accent ease-tau-out h-full rounded-full" style={{ width: `${Math.min(1, progress) * 100}%` }} />
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
