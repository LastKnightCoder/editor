import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";
import useUploadResource from "@/hooks/useUploadResource";
import LocalImage from "@/components/LocalImage";
import "./index.css";

interface WhiteBoardModalProps {
  open: boolean;
  onCancel: () => void;
  onOk: (
    title: string,
    description: string,
    snapshot?: string,
  ) => Promise<void>;
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

  const handleImageUpload = useMemoizedFn(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    },
  );

  const handleRemoveImage = useMemoizedFn(() => {
    setSnapshot("");
  });

  const handleSubmit = useMemoizedFn(async () => {
    if (!title.trim()) {
      setError("请输入标题");
      return;
    }
    if (!description.trim()) {
      setError("请输入描述");
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
      className="wb-modal-overlay fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="wb-modal-container w-full max-w-[520px] m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-slate-900/95 border border-gray-200 dark:border-slate-800">
          <div className="flex items-center gap-3 mb-5">
            <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-purple-50 dark:bg-purple-500/20 border border-purple-200 dark:border-purple-500/30">
              <svg
                className="w-5 h-5 text-purple-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                {modalTitle}
              </h2>
              <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                创建新的白板空间
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
            {/* 图片上传 */}
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                <svg
                  className="w-3.5 h-3.5"
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
                  <div className="relative group">
                    <div className="w-full h-40 rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
                      <LocalImage
                        url={snapshot}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-3">
                      <button
                        type="button"
                        className="px-4 py-2 rounded-lg bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-slate-700 transition-all"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        更换
                      </button>
                      <button
                        type="button"
                        className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-all"
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
                    className="w-full h-40 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-950 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50/50 dark:hover:bg-purple-500/5 transition-all flex flex-col items-center justify-center gap-2 text-gray-500 dark:text-slate-400 disabled:opacity-60 disabled:cursor-not-allowed"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <>
                        <svg
                          className="wb-spin w-8 h-8 text-purple-500"
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
                          className="w-8 h-8"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <span className="text-sm font-medium">
                          点击上传封面图片
                        </span>
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
                  className="w-3.5 h-3.5"
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
                onChange={(e) => {
                  setTitle(e.target.value);
                  setError(null);
                }}
                placeholder="请输入标题"
                className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-purple-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(168,85,247,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(168,85,247,0.25)]"
                disabled={isSubmitting}
              />
            </div>

            {/* 描述输入 */}
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                <svg
                  className="w-3.5 h-3.5"
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
                描述
              </label>
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setError(null);
                }}
                placeholder="请输入描述"
                rows={4}
                className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-purple-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(168,85,247,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(168,85,247,0.25)] resize-y"
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                className="flex-1 px-5 py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-medium cursor-pointer flex items-center justify-center gap-2 transition-all bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                取消
              </button>
              <button
                className="flex-1 px-5 py-3 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-purple-500 text-white shadow-[0_4px_14px_rgba(168,85,247,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-purple-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none"
                onClick={handleSubmit}
                disabled={!title.trim() || !description.trim() || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <svg
                      className="wb-spin w-5 h-5"
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
                      className="w-5 h-5"
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
    document.body,
  );
};

export default WhiteBoardModal;
