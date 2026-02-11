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
    [onCancel, activeTab, isUploading, handleSubmit],
  );

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="webview-modal-overlay fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={onCancel}
          onKeyDown={handleKeyDown}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="webview-modal-container w-full max-w-[460px] m-4"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-slate-900/95 border border-gray-200 dark:border-slate-800">
              {/* Header */}
              <div className="flex items-start gap-3 mb-5">
                <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/30">
                  <svg
                    className="w-5 h-5 text-emerald-500"
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
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                    添加网页
                  </h2>
                  <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                    选择远程网址或本地 HTML
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

              {/* Tabs */}
              <div className="flex gap-2 mb-4 p-1 rounded-xl bg-gray-100 dark:bg-slate-950">
                <button
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === "url"
                      ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm"
                      : "text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"
                  }`}
                  onClick={() => setActiveTab("url")}
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg
                      className="w-4 h-4"
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
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === "local"
                      ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm"
                      : "text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"
                  }`}
                  onClick={() => setActiveTab("local")}
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg
                      className="w-4 h-4"
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
                        onChange={(e) => setRemoteTitle(e.target.value)}
                        placeholder="请输入网页标题（可选）"
                        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-emerald-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(16,185,129,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(16,185,129,0.25)]"
                      />
                      <div className="relative">
                        <input
                          ref={inputRef}
                          type="text"
                          value={remoteUrl}
                          onChange={(e) => {
                            setRemoteUrl(e.target.value);
                            setError(null);
                          }}
                          placeholder="在此粘贴网址，例如：https://www.example.com"
                          className="w-full px-4 py-3.5 pl-10 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-emerald-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(16,185,129,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(16,185,129,0.25)]"
                        />
                        <svg
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none text-gray-400 dark:text-slate-500"
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
                        onChange={(e) => setLocalTitle(e.target.value)}
                        placeholder="请输入网页标题（可选）"
                        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-emerald-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(16,185,129,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(16,185,129,0.25)]"
                      />

                      <button
                        className="w-full px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-700 text-sm font-medium cursor-pointer flex items-center justify-center gap-2 transition-all text-gray-600 dark:text-slate-400 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 disabled:opacity-60 disabled:cursor-not-allowed"
                        onClick={handleSelectLocalFile}
                        disabled={isUploading}
                      >
                        {isUploading ? (
                          <>
                            <svg
                              className="webview-spin w-5 h-5"
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
                              className="w-5 h-5"
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
                          className="px-3.5 py-2.5 rounded-lg text-[13px] bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                        >
                          <div className="flex items-center gap-2">
                            <svg
                              className="w-4 h-4 shrink-0"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span className="truncate">
                              已选择：{localFileName}
                            </span>
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
                    className="px-3.5 py-2.5 rounded-lg text-[13px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400"
                  >
                    {error}
                  </motion.div>
                )}

                <button
                  className="w-full px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-emerald-500 text-white shadow-[0_4px_14px_rgba(16,185,129,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-emerald-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700"
                  onClick={handleSubmit}
                  disabled={
                    isUploading ||
                    (activeTab === "url" && !remoteUrl.trim()) ||
                    (activeTab === "local" && !localUrl)
                  }
                >
                  <svg
                    className="w-5 h-5"
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
    document.body,
  );
};

export default WebViewSelectModal;
