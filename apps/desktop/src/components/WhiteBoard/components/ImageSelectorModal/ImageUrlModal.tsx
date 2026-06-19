import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, X } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import { validateImageUrl } from "./imageActions";

interface ImageUrlModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (url: string) => Promise<void> | void;
}

const ImageUrlModal: React.FC<ImageUrlModalProps> = ({
  open,
  onCancel,
  onConfirm,
}) => {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setUrl("");
    setError(null);
    setSubmitting(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const handleSubmit = useMemoizedFn(async () => {
    if (submitting) return;
    try {
      const finalUrl = validateImageUrl(url);
      setError(null);
      setSubmitting(true);
      await onConfirm(finalUrl);
    } catch (err) {
      setError((err as Error).message || "插入图片失败");
    } finally {
      setSubmitting(false);
    }
  });

  const handleKeyDown = useMemoizedFn((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  });

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="m-4 w-full max-w-[460px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-blue-200 bg-blue-50 text-blue-500 dark:border-blue-500/30 dark:bg-blue-500/20">
              <Link size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">
                输入图片 URL
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">
                插入一张网络图片到当前白板视口中心
              </p>
            </div>
            <button
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 hover:text-gray-700 dark:bg-zinc-800 dark:text-slate-400 dark:hover:bg-zinc-700 dark:hover:text-slate-200"
              onClick={onCancel}
              type="button"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <input
              ref={inputRef}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://example.com/image.png"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-blue-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(59,130,246,0.15)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(59,130,246,0.25)]"
            />

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-zinc-700"
                onClick={onCancel}
                type="button"
              >
                取消
              </button>
              <button
                className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border-none bg-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(59,130,246,0.35),0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-px hover:bg-blue-600 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
                onClick={handleSubmit}
                disabled={!url.trim() || submitting}
                type="button"
              >
                {submitting ? "插入中..." : "插入图片"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ImageUrlModal;
