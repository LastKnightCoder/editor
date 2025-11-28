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
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
      const info = await getYoutubeVideoInfo(
        url,
        setting.integration.youtube.proxy,
      );

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
        return (
          getResolutionValue(b.resolution) - getResolutionValue(a.resolution)
        );
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

    const videoStream = videoInfo.videoStreams.find(
      (f) => f.id === selectedVideo,
    );
    const audioStream = videoInfo.audioStreams.find(
      (f) => f.id === selectedAudio,
    );

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
    [onCancel, step, isAnalyzing, handleAnalyze],
  );

  if (!open) return null;

  return createPortal(
    <div
      className="yt-modal-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="yt-modal-container w-full max-w-[460px] m-4"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "input" ? (
          // Step 1: URL Input
          <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-slate-900/95 border border-gray-200 dark:border-slate-800">
            <div className="flex items-start gap-3 mb-5">
              <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30">
                <svg
                  className="w-5 h-5 text-indigo-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                  添加 YouTube 视频
                </h2>
                <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                  解析视频源并获取流信息
                </p>
              </div>
              <button
                className="shrink-0 w-8 h-8 rounded-lg border-none cursor-pointer flex items-center justify-center transition-all bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-200"
                onClick={onCancel}
              >
                <svg
                  className="w-[18px] h-[18px]"
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
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setError(null);
                  }}
                  placeholder="在此粘贴 YouTube 链接..."
                  className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)] disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={isAnalyzing}
                />
              </div>

              {error && (
                <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              <button
                className="w-full px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-indigo-500 text-white shadow-[0_4px_14px_rgba(99,102,241,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-indigo-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700"
                onClick={handleAnalyze}
                disabled={!url.trim() || isAnalyzing}
              >
                {isAnalyzing ? (
                  <>
                    <svg
                      className="yt-spin w-5 h-5"
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
                      className="w-5 h-5"
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
          // Step 2: Format Configuration
          <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-slate-900/95 border border-gray-200 dark:border-slate-800">
            <div className="flex items-center gap-3 pb-4 mb-1 border-b border-gray-200 dark:border-slate-800">
              {videoInfo?.thumbnail && (
                <img
                  src={videoInfo.thumbnail}
                  alt={videoInfo.title}
                  className="w-20 h-[45px] object-cover rounded-lg shrink-0 border border-gray-200 dark:border-slate-700 shadow-sm"
                />
              )}
              <div className="flex-1 min-w-0">
                <h2
                  className="text-sm font-bold m-0 overflow-hidden text-ellipsis whitespace-nowrap pr-2 text-gray-800 dark:text-white"
                  title={videoInfo?.title}
                >
                  {videoInfo?.title}
                </h2>
                <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                  请配置下载参数
                </p>
              </div>
              <button
                className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-200"
                onClick={handleBack}
              >
                返回
              </button>
              <button
                className="shrink-0 w-8 h-8 rounded-lg border-none cursor-pointer flex items-center justify-center transition-all bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-200"
                onClick={onCancel}
              >
                <svg
                  className="w-[18px] h-[18px]"
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
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect
                      x="2"
                      y="2"
                      width="20"
                      height="20"
                      rx="2.18"
                      ry="2.18"
                    />
                    <path d="m7 2 10 10-10 10" />
                  </svg>
                  视频流
                </label>
                <div className="relative">
                  <select
                    value={selectedVideo}
                    onChange={(e) => setSelectedVideo(e.target.value)}
                    className="w-full py-2.5 pl-3.5 pr-9 rounded-[10px] text-[13px] outline-none appearance-none cursor-pointer transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white focus:border-indigo-500 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[0_0_0_3px_rgba(99,102,241,0.25)] [&_option]:dark:bg-slate-900 [&_option]:dark:text-white"
                  >
                    {videoInfo?.videoStreams.map((stream) => (
                      <option key={stream.id} value={stream.id}>
                        {stream.resolution} · {stream.format?.toUpperCase()} ·{" "}
                        {stream.codecs} {stream.fps ? `· ${stream.fps}fps` : ""}
                        {stream.size
                          ? ` · ${formatFileSize(Number(stream.size))}`
                          : ""}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-400 dark:text-slate-500"
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
                    className="w-3.5 h-3.5"
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
                    onChange={(e) => setSelectedAudio(e.target.value)}
                    className="w-full py-2.5 pl-3.5 pr-9 rounded-[10px] text-[13px] outline-none appearance-none cursor-pointer transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white focus:border-indigo-500 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[0_0_0_3px_rgba(99,102,241,0.25)] [&_option]:dark:bg-slate-900 [&_option]:dark:text-white"
                  >
                    {videoInfo?.audioStreams.map((stream) => (
                      <option key={stream.id} value={stream.id}>
                        {stream.resolution} · {stream.format?.toUpperCase()} ·{" "}
                        {stream.codecs} {stream.fps ? `· ${stream.fps}fps` : ""}
                        {stream.size
                          ? ` · ${formatFileSize(Number(stream.size))}`
                          : ""}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-400 dark:text-slate-500"
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
                <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              <button
                className="w-full px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-emerald-500 text-white shadow-[0_4px_14px_rgba(16,185,129,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-emerald-600 hover:-translate-y-px active:scale-[0.98]"
                onClick={handleSubmit}
              >
                <svg
                  className="w-5 h-5"
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
    document.body,
  );
};

export default YoutubeVideoSelectModal;
