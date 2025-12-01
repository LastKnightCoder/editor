import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";

import "./index.css";

export interface RemoteEpubSelectResult {
  url: string;
  fileName: string;
}

interface RemoteEpubSelectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (result: RemoteEpubSelectResult) => void;
  initialUrl?: string;
  initialFileName?: string;
}

const deriveFileNameFromUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const last = segments[segments.length - 1];
      if (last.includes(".")) {
        return last;
      }
      return `${last}.epub`;
    }
  } catch (e) {
    // ignore
  }
  return "book.epub";
};

const RemoteEpubSelectModal = ({
  open,
  onCancel,
  onConfirm,
  initialUrl = "",
  initialFileName = "",
}: RemoteEpubSelectModalProps) => {
  const [url, setUrl] = useState(initialUrl);
  const [fileName, setFileName] = useState(initialFileName);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUrl(initialUrl);
      setFileName(initialFileName);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, initialUrl, initialFileName]);

  const handleSubmit = useMemoizedFn(() => {
    if (!url.trim()) {
      setError("请输入 EPUB 链接");
      return;
    }

    try {
      new URL(url);
    } catch {
      setError("请输入有效的 EPUB 链接");
      return;
    }

    const resolvedName = fileName.trim() || deriveFileNameFromUrl(url);
    if (!resolvedName) {
      setError("请填写文件名");
      return;
    }

    onConfirm({ url: url.trim(), fileName: resolvedName });
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, onCancel],
  );

  const handleUrlBlur = () => {
    if (!fileName.trim() && url.trim()) {
      setFileName(deriveFileNameFromUrl(url));
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="remote-modal-overlay remote-modal-overlay--epub fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="remote-modal-container remote-modal-container--epub w-full max-w-[520px] m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-slate-900/95 border border-gray-200 dark:border-slate-800 flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-purple-50 dark:bg-purple-500/20 border border-purple-200 dark:border-purple-500/30">
              <svg
                className="w-5 h-5 text-purple-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 4h7v16H3z" />
                <path d="M14 4h7v16h-7z" />
                <path d="M3 8h18" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                添加远程 EPUB
              </h2>
              <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                适用于可直接下载的 EPUB 文件
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
            <div className="flex flex-col gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-400">
                EPUB 链接
              </label>
              <input
                ref={inputRef}
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                onBlur={handleUrlBlur}
                placeholder="例如：https://example.com/book.epub"
                className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-purple-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(168,85,247,0.2)]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-400">
                文件名称
              </label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => {
                  setFileName(e.target.value);
                  setError(null);
                }}
                placeholder="例如：时间管理.epub"
                className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-purple-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(168,85,247,0.2)]"
              />
            </div>

            {error && (
              <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 text-purple-600 dark:text-purple-300">
                {error}
              </div>
            )}

            <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-purple-50/60 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 text-purple-700 dark:text-purple-300">
              <div className="flex items-start gap-2">
                <svg
                  className="w-4 h-4 mt-0.5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
                <div className="flex-1">
                  <p className="font-medium mb-1">
                    推荐使用公开托管的 EPUB 资源
                  </p>
                  <ul className="text-xs space-y-0.5 opacity-90">
                    <li>• 支持 GitHub、WebDAV、S3 等直链资源</li>
                    <li>• 若链接没有扩展名，会自动补全 .epub</li>
                  </ul>
                </div>
              </div>
            </div>

            <button
              className="w-full px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-purple-500 text-white shadow-[0_4px_14px_rgba(168,85,247,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-purple-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none"
              onClick={handleSubmit}
              disabled={!url.trim()}
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
      </div>
    </div>,
    document.body,
  );
};

export default RemoteEpubSelectModal;
