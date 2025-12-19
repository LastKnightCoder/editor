import React, { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";
import { Music } from "lucide-react";

interface RemoteAudioSelectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (url: string) => void;
  initialUrl?: string;
}

const RemoteAudioSelectModal: React.FC<RemoteAudioSelectModalProps> = ({
  open,
  onCancel,
  onConfirm,
  initialUrl = "",
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUrl(initialUrl);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, initialUrl]);

  const handleSubmit = useMemoizedFn(() => {
    if (!url.trim()) {
      setError("请输入音频链接");
      return;
    }

    try {
      new URL(url);
    } catch {
      setError("请输入有效的音频链接");
      return;
    }

    onConfirm(url.trim());
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
    [onCancel, handleSubmit],
  );

  if (!open) return null;

  return createPortal(
    <div
      className="remote-modal-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="remote-modal-container w-full max-w-[460px] m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-slate-900/95 border border-gray-200 dark:border-slate-800">
          <div className="flex items-start gap-3 mb-5">
            <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-cyan-50 dark:bg-cyan-500/20 border border-cyan-200 dark:border-cyan-500/30">
              <Music className="w-5 h-5 text-cyan-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                添加在线音频
              </h2>
              <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                输入音频的直链地址
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
                placeholder="在此粘贴音频直链，例如：https://example.com/audio.mp3"
                className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-cyan-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(6,182,212,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(6,182,212,0.25)]"
              />
            </div>

            {error && (
              <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20 text-cyan-700 dark:text-cyan-400">
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
                  <p className="font-medium mb-1">支持的音频格式</p>
                  <ul className="text-xs space-y-0.5 opacity-90">
                    <li>MP3, WAV, OGG, AAC 等浏览器支持的格式</li>
                    <li>确保链接可直接访问（非需要登录的资源）</li>
                  </ul>
                </div>
              </div>
            </div>

            <button
              className="w-full px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-cyan-500 text-white shadow-[0_4px_14px_rgba(6,182,212,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-cyan-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700"
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

export default RemoteAudioSelectModal;
