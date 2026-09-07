import React, { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";
import { isYoutubeUrl } from "@/utils/youtube/parser";
import { getYoutubeVideoInfo } from "@/commands/youtube-cache";
import useSettingStore from "@/stores/useSettingStore";
import type { StreamOption, YoutubeVideoInfo } from "@/types";
import "./index.css";

export interface YoutubeVideoSelectResult {
  url: string;
  videoStream: StreamOption;
  audioStream: StreamOption;
  title: string;
  thumbnail?: string;
}

interface YoutubeVideoSelectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (result: YoutubeVideoSelectResult) => void;
  initialUrl?: string;
}

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const YoutubeVideoSelectModal: React.FC<YoutubeVideoSelectModalProps> = ({
  open,
  onCancel,
  onConfirm,
  initialUrl = "",
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [step, setStep] = useState<"input" | "config">("input");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<YoutubeVideoInfo | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string>("");
  const [selectedAudio, setSelectedAudio] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { setting } = useSettingStore.getState();

  useEffect(() => {
    if (open) {
      setUrl(initialUrl);
      setStep("input");
      setError(null);
      setVideoInfo(null);
      setSelectedVideo("");
      setSelectedAudio("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, initialUrl]);

  const handleAnalyze = useMemoizedFn(async () => {
    if (!url.trim()) {
      setError("请输入 YouTube 链接");
      return;
    }

    if (!isYoutubeUrl(url)) {
      setError("请输入有效的 YouTube 链接");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const info = await getYoutubeVideoInfo(url, setting.integration.youtube.proxy);

      if (!info) {
        setError("无法获取视频信息，请检查链接是否正确");
        return;
      }

      if (info.videoStreams.length === 0) {
        setError("未找到可用的视频流");
        return;
      }

      if (info.audioStreams.length === 0) {
        setError("未找到可用的音频流");
        return;
      }

      // 按分辨率排序视频流（高分辨率在前）
      const sortedVideoStreams = [...info.videoStreams].sort((a, b) => {
        const getResolutionValue = (resolution: string): number => {
          const match = resolution.match(/(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        };
        return getResolutionValue(b.resolution) - getResolutionValue(a.resolution);
      });

      setVideoInfo({
        ...info,
        videoStreams: sortedVideoStreams,
      });
      setSelectedVideo(sortedVideoStreams[0]?.id || "");
      setSelectedAudio(info.audioStreams[0]?.id || "");
      setStep("config");
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败，请稍后重试");
    } finally {
      setIsAnalyzing(false);
    }
  });

  const handleSubmit = useMemoizedFn(() => {
    if (!videoInfo) return;

    const videoStream = videoInfo.videoStreams.find(f => f.id === selectedVideo);
    const audioStream = videoInfo.audioStreams.find(f => f.id === selectedAudio);

    if (!videoStream || !audioStream) {
      setError("请选择视频和音频流");
      return;
    }

    onConfirm({
      url: videoInfo.url,
      videoStream,
      audioStream,
      title: videoInfo.title,
      thumbnail: videoInfo.thumbnail,
    });
  });

  const handleBack = useCallback(() => {
    setStep("input");
    setVideoInfo(null);
    setSelectedVideo("");
    setSelectedAudio("");
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      } else if (e.key === "Enter" && step === "input" && !isAnalyzing) {
        handleAnalyze();
      }
    },
    [onCancel, step, isAnalyzing, handleAnalyze]
  );

  if (!open) return null;

  return createPortal(
    <div
      className="yt-modal-overlay z-9999 fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="yt-modal-container m-4 w-full max-w-[460px]"
        onClick={e => e.stopPropagation()}
      >
        {step === "input" ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
            <div className="mb-5 flex items-start gap-3">
              <div className="border-[var(--th-border-focus)]/30 dark:border-[var(--th-border-focus)]/30 dark:bg-[var(--th-accent)]/20 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border bg-[var(--th-accent-soft)]">
                <svg
                  className="h-5 w-5 text-[var(--th-accent)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">
                  添加 YouTube 视频
                </h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">
                  解析视频源并获取流信息
                </p>
              </div>
              <button
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 hover:text-gray-700 dark:bg-zinc-800 dark:text-slate-400 dark:hover:bg-zinc-700 dark:hover:text-slate-200"
                onClick={onCancel}
              >
                <svg
                  className="h-[18px] w-[18px]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={url}
                  onChange={e => {
                    setUrl(e.target.value);
                    setError(null);
                  }}
                  placeholder="在此粘贴 YouTube 链接..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)]"
                  disabled={isAnalyzing}
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                  {error}
                </div>
              )}

              <button
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-[var(--th-btn-bg)] px-5 py-3.5 text-sm font-semibold text-[var(--th-btn-text)] shadow-sm transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700 dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
                onClick={handleAnalyze}
                disabled={!url.trim() || isAnalyzing}
              >
                {isAnalyzing ? (
                  <>
                    <svg
                      className="yt-spin h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    正在分析...
                  </>
                ) : (
                  <>
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                    开始分析
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
            <div className="mb-1 flex items-center gap-3 border-b border-gray-200 pb-4 dark:border-slate-800">
              {videoInfo?.thumbnail && (
                <img
                  src={videoInfo.thumbnail}
                  alt={videoInfo.title}
                  className="h-[45px] w-20 shrink-0 rounded-lg border border-gray-200 object-cover shadow-sm dark:border-slate-700"
                />
              )}
              <div className="min-w-0 flex-1">
                <h2
                  className="m-0 overflow-hidden text-ellipsis whitespace-nowrap pr-2 text-sm font-bold text-gray-800 dark:text-white"
                  title={videoInfo?.title}
                >
                  {videoInfo?.title}
                </h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">请配置下载参数</p>
              </div>
              <button
                className="shrink-0 cursor-pointer rounded-md border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500 transition-all hover:bg-gray-200 hover:text-gray-700 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-400 dark:hover:bg-zinc-700 dark:hover:text-slate-200"
                onClick={handleBack}
              >
                返回
              </button>
              <button
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 hover:text-gray-700 dark:bg-zinc-800 dark:text-slate-400 dark:hover:bg-zinc-700 dark:hover:text-slate-200"
                onClick={onCancel}
              >
                <svg
                  className="h-[18px] w-[18px]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col gap-5">
              {/* Video Stream Selection */}
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                    <path d="m7 2 10 10-10 10" />
                  </svg>
                  视频流
                </label>
                <div className="relative">
                  <select
                    value={selectedVideo}
                    onChange={e => setSelectedVideo(e.target.value)}
                    className="w-full cursor-pointer appearance-none rounded-[10px] border border-gray-200 bg-gray-50 py-2.5 pl-3.5 pr-9 text-[13px] text-gray-800 outline-none transition-all focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:focus:shadow-[0_0_0_3px_rgba(99,102,241,0.25)] [&_option]:dark:bg-zinc-900 [&_option]:dark:text-white"
                  >
                    {videoInfo?.videoStreams.map(stream => (
                      <option key={stream.id} value={stream.id}>
                        {stream.resolution} · {stream.format?.toUpperCase()} · {stream.codecs}{" "}
                        {stream.fps ? `· ${stream.fps}fps` : ""}
                        {stream.size ? ` · ${formatFileSize(Number(stream.size))}` : ""}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>

              {/* Audio Stream Selection */}
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  音频流
                </label>
                <div className="relative">
                  <select
                    value={selectedAudio}
                    onChange={e => setSelectedAudio(e.target.value)}
                    className="w-full cursor-pointer appearance-none rounded-[10px] border border-gray-200 bg-gray-50 py-2.5 pl-3.5 pr-9 text-[13px] text-gray-800 outline-none transition-all focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:focus:shadow-[0_0_0_3px_rgba(99,102,241,0.25)] [&_option]:dark:bg-zinc-900 [&_option]:dark:text-white"
                  >
                    {videoInfo?.audioStreams.map(stream => (
                      <option key={stream.id} value={stream.id}>
                        {stream.resolution} · {stream.format?.toUpperCase()} · {stream.codecs}{" "}
                        {stream.fps ? `· ${stream.fps}fps` : ""}
                        {stream.size ? ` · ${formatFileSize(Number(stream.size))}` : ""}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                  {error}
                </div>
              )}

              <button
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-[var(--th-btn-bg)] px-5 py-3.5 text-sm font-semibold text-[var(--th-btn-text)] shadow-sm transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:scale-[0.98]"
                onClick={handleSubmit}
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                确认添加
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default YoutubeVideoSelectModal;
