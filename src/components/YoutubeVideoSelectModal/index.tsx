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

      setVideoInfo(info);
      setSelectedVideo(info.videoStreams[0]?.id || "");
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
      className="yt-modal-overlay"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div className="yt-modal-container" onClick={(e) => e.stopPropagation()}>
        {step === "input" ? (
          // Step 1: URL Input
          <div className="yt-modal-content">
            <div className="yt-modal-header">
              <div className="yt-header-icon">
                <svg
                  className="yt-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </div>
              <div className="yt-header-text">
                <h2>添加 YouTube 视频</h2>
                <p>解析视频源并获取流信息</p>
              </div>
              <button className="yt-close-btn" onClick={onCancel}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="yt-modal-body">
              <div className="yt-input-wrapper">
                <input
                  ref={inputRef}
                  type="text"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setError(null);
                  }}
                  placeholder="在此粘贴 YouTube 链接..."
                  className="yt-url-input"
                  disabled={isAnalyzing}
                />
              </div>

              {error && <div className="yt-error-message">{error}</div>}

              <button
                className="yt-primary-btn"
                onClick={handleAnalyze}
                disabled={!url.trim() || isAnalyzing}
              >
                {isAnalyzing ? (
                  <>
                    <svg
                      className="yt-icon yt-spin"
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
                      className="yt-icon"
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
          <div className="yt-modal-content yt-config-step">
            <div className="yt-video-header">
              {videoInfo?.thumbnail && (
                <img
                  src={videoInfo.thumbnail}
                  alt={videoInfo.title}
                  className="yt-thumbnail"
                />
              )}
              <div className="yt-video-info">
                <h2 className="yt-video-title" title={videoInfo?.title}>
                  {videoInfo?.title}
                </h2>
                <p className="yt-video-subtitle">请配置下载参数</p>
              </div>
              <button className="yt-back-btn" onClick={handleBack}>
                返回
              </button>
              <button className="yt-close-btn" onClick={onCancel}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="yt-modal-body">
              {/* Video Stream Selection */}
              <div className="yt-select-group">
                <label className="yt-select-label">
                  <svg
                    className="yt-label-icon"
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
                <div className="yt-select-wrapper">
                  <select
                    value={selectedVideo}
                    onChange={(e) => setSelectedVideo(e.target.value)}
                    className="yt-select"
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
                    className="yt-select-arrow"
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
              <div className="yt-select-group">
                <label className="yt-select-label">
                  <svg
                    className="yt-label-icon"
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
                <div className="yt-select-wrapper">
                  <select
                    value={selectedAudio}
                    onChange={(e) => setSelectedAudio(e.target.value)}
                    className="yt-select"
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
                    className="yt-select-arrow"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>

              {error && <div className="yt-error-message">{error}</div>}

              <button className="yt-confirm-btn" onClick={handleSubmit}>
                <svg
                  className="yt-icon"
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
