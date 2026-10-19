/**
 * 在线视频取源浮层：下载进度 / 失败态的统一版式（视频插件 / 远程直链共用）。
 * 默认铺满父容器（通常是 bg-sunken 的视频框）居中、不自带卡片底色；
 * framed 时自带 16:9 纸面卡片（与播放器同形，就绪后原位换成播放器不跳高度）。
 * 就绪后返回 null，由调用方渲染 video 元素。
 */

import { Check, CircleAlert } from "lucide-react";
import { Button, Spinner, cn } from "@tau/ui";
import type { VideoLoaderStreamProgress } from "@/editor-providers/types";

export interface VideoSourceLoaderProps {
  loading: boolean;
  error: string | null;
  streamProgress: VideoLoaderStreamProgress | null;
  /** 来源名，出现在标题里（视频提供方插件名），远程直链不传 */
  sourceLabel?: string;
  /** 失败时的排查建议 */
  tips: string[];
  /** 自带 16:9 纸面卡片（调用方没有视频框时使用） */
  framed?: boolean;
  /** 失败后重新取源；不传则不显示重试按钮 */
  onRetry?: () => void;
}

interface ProgressTrack {
  label: string;
  percent: number;
  detail: string;
}

const formatBytes = (bytes?: number): string => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const ratio = (done?: number, total?: number) =>
  total ? Math.min(((done || 0) / total) * 100, 100) : 0;

/** 把宽松的进度形状归一成若干条进度轨：音视频分流下载各一条，单流下载 / 合并各一条 */
function getTracks(progress: VideoLoaderStreamProgress): ProgressTrack[] {
  if (progress.stage === "merging") {
    const percent = Math.min(progress.processed ?? progress.percent ?? 0, 100);
    return [{ label: "合并音视频", percent, detail: `${Math.round(percent)}%` }];
  }
  if (progress.stage !== "downloading") return [];

  const tracks: ProgressTrack[] = [];
  if (progress.videoTotal) {
    tracks.push({
      label: "视频",
      percent: ratio(progress.videoDownloaded, progress.videoTotal),
      detail: `${formatBytes(progress.videoDownloaded)} / ${formatBytes(progress.videoTotal)}`,
    });
  }
  if (progress.audioTotal) {
    tracks.push({
      label: "音频",
      percent: ratio(progress.audioDownloaded, progress.audioTotal),
      detail: `${formatBytes(progress.audioDownloaded)} / ${formatBytes(progress.audioTotal)}`,
    });
  }
  if (tracks.length === 0 && (progress.total || progress.percent !== undefined)) {
    tracks.push({
      label: "下载",
      percent: Math.min(progress.percent ?? ratio(progress.downloaded, progress.total), 100),
      detail: progress.total
        ? `${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)}`
        : `${Math.round(progress.percent ?? 0)}%`,
    });
  }
  return tracks;
}

function Track({ label, percent, detail }: ProgressTrack) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-tau-sm flex items-baseline justify-between gap-3">
        <span className="text-ink-2">{label}</span>
        <span className="text-ink-3 font-tau-mono tabular-nums">{detail}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="bg-ink-3/30 h-1 overflow-hidden rounded-full"
      >
        <div
          className="bg-accent ease-tau-out h-full rounded-full transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

const FRAME_CLASS = "flex h-full min-h-[220px] w-full items-center justify-center px-8 py-6";
const CARD_CLASS = "rounded-tau-md bg-surface shadow-card aspect-video w-full overflow-hidden";

export function VideoSourceLoader({
  loading,
  error,
  streamProgress,
  sourceLabel,
  tips,
  framed = false,
  onRetry,
}: VideoSourceLoaderProps) {
  const frameClass = cn(FRAME_CLASS, framed && CARD_CLASS, framed && "min-h-0");

  if (loading) {
    const tracks = streamProgress ? getTracks(streamProgress) : [];
    const completed = streamProgress?.stage === "completed";
    const title = sourceLabel ? `正在缓存 ${sourceLabel} 视频` : "正在下载视频";

    return (
      <div role="status" aria-live="polite" className={frameClass}>
        <div className="flex w-full max-w-[360px] flex-col gap-5">
          <div className="flex items-center gap-3">
            {completed ? (
              <span className="bg-ok-soft text-ok grid size-8 shrink-0 place-items-center rounded-full">
                <Check className="size-4" strokeWidth={2} />
              </span>
            ) : (
              <span className="bg-accent-soft grid size-8 shrink-0 place-items-center rounded-full">
                <Spinner className="size-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-tau-body text-ink-1 truncate font-medium">
                {completed ? "视频已就绪" : title}
              </div>
              <div className="text-tau-sm text-ink-3 truncate">
                {streamProgress?.message || "正在获取视频信息…"}
              </div>
            </div>
          </div>
          {tracks.length > 0 && (
            <div className="flex flex-col gap-3.5">
              {tracks.map(track => (
                <Track key={track.label} {...track} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className={frameClass}>
        <div className="flex w-full max-w-[360px] flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="bg-danger-soft text-danger grid size-8 shrink-0 place-items-center rounded-full">
              <CircleAlert className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-tau-body text-ink-1 font-medium">
                {sourceLabel ? `${sourceLabel} 视频加载失败` : "视频下载失败"}
              </div>
              <p className="text-tau-sm text-ink-2 mt-0.5 break-words">{error}</p>
            </div>
          </div>
          {tips.length > 0 && (
            <ul className="border-ink-3/20 flex flex-col gap-1 border-t pl-11 pt-3">
              {tips.map(tip => (
                <li key={tip} className="text-tau-sm text-ink-3 flex items-start gap-2">
                  <span className="bg-ink-3 mt-[7px] size-1 shrink-0 rounded-full" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          )}
          {onRetry && (
            <div className="pl-11">
              <Button size="sm" variant="primary" onClick={onRetry}>
                重试
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default VideoSourceLoader;
