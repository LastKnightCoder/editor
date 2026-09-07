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
    [handleSubmit, onCancel]
  );

  const handleUrlBlur = () => {
    if (!fileName.trim() && url.trim()) {
      setFileName(deriveFileNameFromUrl(url));
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="remote-modal-overlay remote-modal-overlay--epub z-9999 fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="remote-modal-container remote-modal-container--epub m-4 w-full max-w-[520px]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
          <div className="flex items-start gap-3">
            <div className="border-[var(--th-border-focus)]/30 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border bg-[var(--th-accent-soft)]">
              <svg
                className="h-5 w-5 text-[var(--th-accent)]"
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
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">
                添加远程 EPUB
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">
                适用于可直接下载的 EPUB 文件
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
            <div className="flex flex-col gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-400">EPUB 链接</label>
              <input
                ref={inputRef}
                type="text"
                value={url}
                onChange={e => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                onBlur={handleUrlBlur}
                placeholder="例如：https://example.com/book.epub"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-400">文件名称</label>
              <input
                type="text"
                value={fileName}
                onChange={e => {
                  setFileName(e.target.value);
                  setError(null);
                }}
                placeholder="例如：时间管理.epub"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
              />
            </div>

            {error && (
              <div className="border-[var(--th-border-focus)]/30 rounded-lg border bg-[var(--th-accent-soft)] px-3.5 py-2.5 text-[13px] text-[var(--th-active-text)]">
                {error}
              </div>
            )}

            <div className="border-[var(--th-border-focus)]/30 rounded-lg border bg-[var(--th-accent-soft)] px-3.5 py-2.5 text-[13px] text-[var(--th-active-text)]">
              <div className="flex items-start gap-2">
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
                <div className="flex-1">
                  <p className="mb-1 font-medium">推荐使用公开托管的 EPUB 资源</p>
                  <ul className="space-y-0.5 text-xs opacity-90">
                    <li>• 支持 GitHub、WebDAV、S3 等直链资源</li>
                    <li>• 若链接没有扩展名，会自动补全 .epub</li>
                  </ul>
                </div>
              </div>
            </div>

            <button
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-[var(--th-btn-bg)] px-5 py-3.5 text-sm font-semibold text-[var(--th-btn-text)] shadow-sm transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
              onClick={handleSubmit}
              disabled={!url.trim()}
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
      </div>
    </div>,
    document.body
  );
};

export default RemoteEpubSelectModal;
