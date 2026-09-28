import React, { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";

export interface LinkSelectResult {
  url: string;
  text?: string;
}

interface LinkSelectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (result: LinkSelectResult) => void;
  initialUrl?: string;
  initialText?: string;
}

const LinkSelectModal: React.FC<LinkSelectModalProps> = ({
  open,
  onCancel,
  onConfirm,
  initialUrl = "",
  initialText = "",
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUrl(initialUrl);
      setText(initialText);
      setError(null);
      // Focus URL input after a short delay to allow animation
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, initialUrl, initialText]);

  const handleSubmit = useMemoizedFn(() => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError("请输入链接地址");
      return;
    }

    // Basic URL validation could go here if needed,
    // but for a general link we might want to be permissive (e.g. relative links, anchors)
    // or strictly require protocol. Let's assume basic length check is enough for now
    // or add a simple protocol check if preferred.

    onConfirm({ url: trimmedUrl, text: text.trim() || trimmedUrl });
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [onCancel, handleSubmit]
  );

  if (!open) return null;

  return createPortal(
    <div
      className="z-9999 fixed inset-0 flex animate-[yt-fade-in_0.15s_ease-out] items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="m-4 w-full max-w-[460px] animate-[yt-scale-in_0.2s_ease-out]"
        onClick={e => e.stopPropagation()}
      >
        <div className="rounded-2xl border border-[var(--ed-border)] bg-white p-6 shadow-2xl dark:bg-zinc-900/95">
          {/* Header */}
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/20">
              <svg
                className="h-5 w-5 text-blue-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">添加链接</h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">插入或编辑超链接</p>
            </div>
            <button
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-[var(--ed-bg-sunken)] text-[var(--ed-text-secondary)] transition-all hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-zinc-700 dark:hover:text-slate-200"
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

          {/* Body */}
          <div className="flex flex-col gap-4">
            {/* URL Input */}
            <div className="flex flex-col gap-1.5">
              <label className="ml-1 text-[12px] font-medium text-[var(--ed-text-secondary)]">
                链接地址
              </label>
              <div className="group relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ed-text-tertiary)] transition-colors group-focus-within:text-blue-500">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={url}
                  onChange={e => {
                    setUrl(e.target.value);
                    setError(null);
                  }}
                  placeholder="https://example.com"
                  className="w-full rounded-xl border border-[var(--ed-border)] bg-[var(--ed-bg-sunken)] py-3 pl-10 pr-4 text-sm text-gray-800 shadow-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] dark:text-white dark:focus:bg-zinc-900"
                />
              </div>
            </div>

            {/* Text Input (Optional) */}
            {/* Only show if we are inserting a new link or editing text is allowed/needed. 
                For simple link editing, maybe just URL? 
                But standard link dialogs usually allow text editing. 
                Based on current Link component usage, text is children.
                Updating text via modal might be complex if children are rich text.
                If it's just a string, it's fine. 
                Let's keep it simple: mostly for URL editing, but if it's a new link, text is useful.
            */}

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(37,99,235,0.3),0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-0.5 hover:bg-blue-700 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleSubmit}
              disabled={!url.trim()}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              确认链接
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default LinkSelectModal;
