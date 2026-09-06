import React, { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";
import {
  isBilibiliUrl,
  getVideoInfoByUrl,
  getQualityInfo,
  getQualityOptions,
} from "@/utils/bilibili";
import useSettingStore from "@/stores/useSettingStore";
import type { BiliBiliVideoMetaInfo } from "@/types";
import "./index.css";

export interface BilibiliVideoSelectResult {
  url: string;
  metaInfo: BiliBiliVideoMetaInfo;
  title: string;
  thumbnail?: string;
}

interface BilibiliVideoSelectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (result: BilibiliVideoSelectResult) => void;
  initialUrl?: string;
}

const BilibiliVideoSelectModal: React.FC<BilibiliVideoSelectModalProps> = ({
  open,
  onCancel,
  onConfirm,
  initialUrl = "",
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [step, setStep] = useState<"input" | "config">("input");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<{
    bvid: string;
    cid: string;
    title: string;
    cover: string;
    qualityOptions: Array<{
      label: string;
      value: number;
      needLogin?: boolean;
      needVip?: boolean;
    }>;
  } | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<number>(80);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setting } = useSettingStore.getState();

  useEffect(() => {
    if (open) {
      setUrl(initialUrl);
      setStep("input");
      setError(null);
      setVideoInfo(null);
      setSelectedQuality(80);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, initialUrl]);

  const handleAnalyze = useMemoizedFn(async () => {
    if (!url.trim()) {
      setError("请输入 Bilibili 链接");
      return;
    }

    if (!isBilibiliUrl(url)) {
      setError("请输入有效的 Bilibili 链接");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const credentials = setting.integration.bilibili.credentials;
      const info = await getVideoInfoByUrl(url, credentials);

      if (!info) {
        setError("无法获取视频信息，请检查链接是否正确");
        return;
      }

      const qualityInfo = await getQualityInfo(info.cid, info.bvid, credentials);
      const options = getQualityOptions(qualityInfo.accept_quality);

      if (options.length === 0) {
        setError("未找到可用的清晰度选项");
        return;
      }

      // 设置默认质量
      const hasLogin = !!credentials.SESSDATA;
      const hasVip = !!setting.integration.bilibili.userInfo.vipStatus && hasLogin;
      let defaultQuality: number;
      if (hasVip) {
        defaultQuality = options[0]?.value || 80;
      } else if (hasLogin) {
        const maxQuality = Math.max(
          ...options.filter(opt => opt.value <= 80).map(opt => opt.value)
        );
        defaultQuality = maxQuality || 64;
      } else {
        const maxQuality = Math.max(
          ...options.filter(opt => opt.value <= 64).map(opt => opt.value)
        );
        defaultQuality = maxQuality || 32;
      }

      setVideoInfo({
        bvid: info.bvid,
        cid: info.cid,
        title: info.title,
        cover: info.cover,
        qualityOptions: options,
      });
      setSelectedQuality(defaultQuality);
      setStep("config");
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败，请稍后重试");
    } finally {
      setIsAnalyzing(false);
    }
  });

  const handleSubmit = useMemoizedFn(() => {
    if (!videoInfo) return;

    const selectedOption = videoInfo.qualityOptions.find(opt => opt.value === selectedQuality);

    if (!selectedOption) {
      setError("请选择清晰度");
      return;
    }

    onConfirm({
      url,
      metaInfo: {
        type: "bilibili",
        bvid: videoInfo.bvid,
        cid: videoInfo.cid,
        quality: selectedQuality,
      },
      title: videoInfo.title,
      thumbnail: videoInfo.cover,
    });
  });

  const handleBack = useCallback(() => {
    setStep("input");
    setVideoInfo(null);
    setSelectedQuality(80);
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
      className="bili-modal-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bili-modal-container m-4 w-full max-w-[460px]"
        onClick={e => e.stopPropagation()}
      >
        {step === "input" ? (
          // Step 1: URL Input
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-pink-200 bg-pink-50 dark:border-pink-500/30 dark:bg-pink-500/20">
                <svg className="h-5 w-5 text-pink-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373Z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">
                  添加 Bilibili 视频
                </h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">
                  解析视频信息并选择清晰度
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
                  placeholder="在此粘贴 Bilibili 链接..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-pink-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(236,72,153,0.15)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(236,72,153,0.25)]"
                  disabled={isAnalyzing}
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                  {error}
                </div>
              )}

              <button
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-pink-500 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(236,72,153,0.35),0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-px hover:bg-pink-600 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700 dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
                onClick={handleAnalyze}
                disabled={!url.trim() || isAnalyzing}
              >
                {isAnalyzing ? (
                  <>
                    <svg
                      className="bili-spin h-5 w-5"
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
          // Step 2: Quality Configuration
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
            <div className="mb-1 flex items-center gap-3 border-b border-gray-200 pb-4 dark:border-slate-800">
              {videoInfo?.cover && (
                <img
                  src={videoInfo.cover}
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
                <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">请选择清晰度</p>
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
              {/* Quality Selection */}
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
                  清晰度
                </label>
                <div className="relative">
                  <select
                    value={selectedQuality}
                    onChange={e => setSelectedQuality(Number(e.target.value))}
                    className="w-full cursor-pointer appearance-none rounded-[10px] border border-gray-200 bg-gray-50 py-2.5 pl-3.5 pr-9 text-[13px] text-gray-800 outline-none transition-all focus:border-pink-500 focus:shadow-[0_0_0_3px_rgba(236,72,153,0.15)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:focus:shadow-[0_0_0_3px_rgba(236,72,153,0.25)] [&_option]:dark:bg-zinc-900 [&_option]:dark:text-white"
                  >
                    {videoInfo?.qualityOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                        {opt.needVip ? " · 大会员" : opt.needLogin ? " · 需登录" : ""}
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

export default BilibiliVideoSelectModal;
