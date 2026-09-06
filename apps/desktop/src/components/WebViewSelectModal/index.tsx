import React, { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useMemoizedFn } from "ahooks";
import { normalizeWebviewUrl, getWebviewTitleFromUrl } from "@/utils";
import "./index.css";

export type WebViewSourceType = "remote" | "local";

export interface WebViewSelectResult {
  url: string;
  title: string;
  sourceType: WebViewSourceType;
}

interface WebViewSelectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (result: WebViewSelectResult) => void;
  onSelectFile?: () => Promise<{
    url: string;
    fileName: string;
    title: string;
  } | null>;
}

const WebViewSelectModal: React.FC<WebViewSelectModalProps> = ({
  open,
  onCancel,
  onConfirm,
  onSelectFile,
}) => {
  const [activeTab, setActiveTab] = useState<"url" | "local">("url");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteTitle, setRemoteTitle] = useState("");
  const [localUrl, setLocalUrl] = useState("");
  const [localFileName, setLocalFileName] = useState("");
  const [localTitle, setLocalTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setActiveTab("url");
      setRemoteUrl("");
      setRemoteTitle("");
      setLocalUrl("");
      setLocalFileName("");
      setLocalTitle("");
      setError(null);
      setIsUploading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSelectLocalFile = useMemoizedFn(async () => {
    if (!onSelectFile) return;

    setIsUploading(true);
    setError(null);

    try {
      const result = await onSelectFile();
      if (result) {
        setLocalUrl(result.url);
        setLocalFileName(result.fileName);
        setLocalTitle(result.title || result.fileName);
        setActiveTab("local");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "选择文件失败");
    } finally {
      setIsUploading(false);
    }
  });

  const handleSubmit = useMemoizedFn(() => {
    if (activeTab === "url") {
      if (!remoteUrl.trim()) {
        setError("请输入网址");
        return;
      }

      const normalizedUrl = normalizeWebviewUrl(remoteUrl);
      if (!normalizedUrl) {
        setError("请输入有效的网址");
        return;
      }

      onConfirm({
        url: normalizedUrl,
        title: remoteTitle.trim() || getWebviewTitleFromUrl(normalizedUrl),
        sourceType: "remote",
      });
    } else {
      if (!localUrl) {
        setError("请先选择本地 HTML 文件");
        return;
      }

      onConfirm({
        url: localUrl,
        title: localTitle.trim() || localFileName || "本地网页",
        sourceType: "local",
      });
    }
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      } else if (e.key === "Enter" && activeTab === "url" && !isUploading) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [onCancel, activeTab, isUploading, handleSubmit]
  );

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="webview-modal-overlay z-9999 fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={onCancel}
          onKeyDown={handleKeyDown}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="webview-modal-container m-4 w-full max-w-[460px]"
            onClick={e => e.stopPropagation()}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
              {/* Header */}
              <div className="mb-5 flex items-start gap-3">
                <div className="border-[var(--th-border-focus)]/30 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border bg-[var(--th-accent-soft)]">
                  <svg
                    className="h-5 w-5 text-[var(--th-accent)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">
                    添加网页
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">
                    选择远程网址或本地 HTML
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

              {/* Tabs */}
              <div className="mb-4 flex gap-2 rounded-xl bg-gray-100 p-1 dark:bg-zinc-950">
                <button
                  className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                    activeTab === "url"
                      ? "bg-white text-[var(--th-active-text)] shadow-sm dark:bg-zinc-800"
                      : "text-gray-600 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                  onClick={() => setActiveTab("url")}
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    远程网址
                  </div>
                </button>
                <button
                  className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                    activeTab === "local"
                      ? "bg-white text-[var(--th-active-text)] shadow-sm dark:bg-zinc-800"
                      : "text-gray-600 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                  onClick={() => setActiveTab("local")}
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    本地 HTML
                  </div>
                </button>
              </div>

              {/* Content */}
              <div className="flex flex-col gap-4">
                <AnimatePresence mode="wait">
                  {activeTab === "url" ? (
                    <motion.div
                      key="url"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col gap-3"
                    >
                      <input
                        type="text"
                        value={remoteTitle}
                        onChange={e => setRemoteTitle(e.target.value)}
                        placeholder="请输入网页标题（可选）"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                      />
                      <div className="relative">
                        <input
                          ref={inputRef}
                          type="text"
                          value={remoteUrl}
                          onChange={e => {
                            setRemoteUrl(e.target.value);
                            setError(null);
                          }}
                          placeholder="在此粘贴网址，例如：https://www.example.com"
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 pl-10 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                        />
                        <svg
                          className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-slate-500"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <path d="M2 12h20" />
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="local"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col gap-3"
                    >
                      <input
                        type="text"
                        value={localTitle}
                        onChange={e => setLocalTitle(e.target.value)}
                        placeholder="请输入网页标题（可选）"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                      />

                      <button
                        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 transition-all hover:border-[var(--th-border-focus)] hover:bg-[var(--th-accent-soft)] hover:text-[var(--th-active-text)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-400"
                        onClick={handleSelectLocalFile}
                        disabled={isUploading}
                      >
                        {isUploading ? (
                          <>
                            <svg
                              className="webview-spin h-5 w-5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                            正在上传...
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
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="17 8 12 3 7 8" />
                              <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                            选择本地 HTML 文件
                          </>
                        )}
                      </button>

                      {localFileName && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="border-[var(--th-border-focus)]/30 rounded-lg border bg-[var(--th-accent-soft)] px-3.5 py-2.5 text-[13px] text-[var(--th-active-text)]"
                        >
                          <div className="flex items-center gap-2">
                            <svg
                              className="h-4 w-4 shrink-0"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span className="truncate">已选择：{localFileName}</span>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-[var(--th-danger)]/10 border-[var(--th-danger)]/20 text-status-error rounded-lg border px-3.5 py-2.5 text-[13px]"
                  >
                    {error}
                  </motion.div>
                )}

                <button
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-[var(--th-btn-bg)] px-5 py-3.5 text-sm font-semibold text-[var(--th-btn-text)] shadow-sm transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700 dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
                  onClick={handleSubmit}
                  disabled={
                    isUploading ||
                    (activeTab === "url" && !remoteUrl.trim()) ||
                    (activeTab === "local" && !localUrl)
                  }
                >
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  确认添加
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default WebViewSelectModal;
