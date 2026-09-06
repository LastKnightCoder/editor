import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";
import useUploadResource from "@/hooks/useUploadResource";
import LocalImage from "@/components/LocalImage";
import "./index.css";

interface WhiteBoardModalProps {
  open: boolean;
  onCancel: () => void;
  onOk: (title: string, description: string, snapshot?: string) => Promise<void>;
  initialData?: {
    title: string;
    description: string;
    snapshot?: string;
  };
  modalTitle: string;
  okText: string;
}

const WhiteBoardModal: React.FC<WhiteBoardModalProps> = ({
  open,
  onCancel,
  onOk,
  initialData,
  modalTitle,
  okText,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [snapshot, setSnapshot] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadResource = useUploadResource();

  useEffect(() => {
    if (open) {
      if (initialData) {
        setTitle(initialData.title);
        setDescription(initialData.description);
        setSnapshot(initialData.snapshot || "");
      } else {
        setTitle("");
        setDescription("");
        setSnapshot("");
      }
      setError(null);
      setTimeout(() => titleInputRef.current?.focus(), 100);
    }
  }, [open, initialData]);

  const handleImageUpload = useMemoizedFn(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const url = await uploadResource(file);
      if (url) {
        setSnapshot(url);
      } else {
        setError("图片上传失败");
      }
    } catch (error) {
      console.error("上传失败:", error);
      setError("图片上传失败");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  });

  const handleRemoveImage = useMemoizedFn(() => {
    setSnapshot("");
  });

  const handleSubmit = useMemoizedFn(async () => {
    if (!title.trim()) {
      setError("请输入标题");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onOk(title.trim(), description.trim(), snapshot || undefined);
    } catch (error) {
      console.error("操作失败:", error);
      setError("操作失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  });

  const handleKeyDown = useMemoizedFn((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel();
    }
  });

  if (!open) return null;

  return createPortal(
    <div
      className="wb-modal-overlay z-9999 fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="wb-modal-container m-4 w-full max-w-[520px]"
        onClick={e => e.stopPropagation()}
      >
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
          <div className="mb-5 flex items-center gap-3">
            <div className="border-[var(--th-border-focus)]/30 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border bg-[var(--th-accent-soft)]">
              <svg
                className="h-5 w-5 text-[var(--th-accent)]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">
                {modalTitle}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">创建新的白板空间</p>
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
            {/* 图片上传 */}
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                封面图片（可选）
              </label>
              <div className="relative">
                {snapshot ? (
                  <div className="group relative">
                    <div className="h-40 w-full overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700">
                      <LocalImage url={snapshot} className="h-full w-full object-cover" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center gap-3 rounded-xl bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-100 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-zinc-700"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        更换
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-600"
                        onClick={handleRemoveImage}
                        disabled={isUploading}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="hover:border-[var(--th-border-focus)]/40 hover:bg-[var(--th-accent)]/10 flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 text-gray-500 transition-all disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-zinc-950 dark:text-slate-400"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <>
                        <svg
                          className="wb-spin h-8 w-8 text-[var(--th-accent)]"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        <span className="text-sm">上传中...</span>
                      </>
                    ) : (
                      <>
                        <svg
                          className="h-8 w-8"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <span className="text-sm font-medium">点击上传封面图片</span>
                        <span className="text-xs text-gray-400 dark:text-slate-500">
                          支持 JPG、PNG、GIF、WebP
                        </span>
                      </>
                    )}
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={isUploading}
                />
              </div>
            </div>

            {/* 标题输入 */}
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 7h16M4 12h16M4 17h10" />
                </svg>
                标题
              </label>
              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={e => {
                  setTitle(e.target.value);
                  setError(null);
                }}
                placeholder="请输入标题"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                disabled={isSubmitting}
              />
            </div>

            {/* 描述输入 */}
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                描述（可选）
              </label>
              <textarea
                value={description}
                onChange={e => {
                  setDescription(e.target.value);
                  setError(null);
                }}
                placeholder="请输入描述"
                rows={4}
                className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-zinc-700"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                取消
              </button>
              <button
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-[var(--th-btn-bg)] px-5 py-3 text-sm font-semibold text-[var(--th-btn-text)] shadow-sm transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
                onClick={handleSubmit}
                disabled={!title.trim() || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <svg
                      className="wb-spin h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    处理中...
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
                    {okText}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default WhiteBoardModal;
