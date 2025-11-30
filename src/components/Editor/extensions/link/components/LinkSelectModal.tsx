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
      className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-[yt-fade-in_0.15s_ease-out]"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-[460px] m-4 animate-[yt-scale-in_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-slate-900/95 border border-gray-200 dark:border-slate-800">
          {/* Header */}
          <div className="flex items-start gap-3 mb-5">
            <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-blue-50 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-500/30">
              <svg
                className="w-5 h-5 text-blue-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                添加链接
              </h2>
              <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                插入或编辑超链接
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

          {/* Body */}
          <div className="flex flex-col gap-4">
            {/* URL Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-slate-500 dark:text-slate-400 ml-1">
                链接地址
              </label>
              <div className="relative group">
                 <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-blue-500 transition-colors">
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="7" />
                        <path d="m21 21-4.3-4.3" />
                    </svg>
                 </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setError(null);
                  }}
                  placeholder="https://example.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-sm focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)]"
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
              <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              className="w-full mt-2 px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-blue-600 text-white shadow-[0_4px_14px_rgba(37,99,235,0.3),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-blue-700 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSubmit}
              disabled={!url.trim()}
            >
              <svg
                className="w-4 h-4"
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

