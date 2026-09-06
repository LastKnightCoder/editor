import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";

export interface EditTitleResult {
  title: string;
}

interface EditTitleModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (result: EditTitleResult) => void;
  initialTitle?: string;
  modalTitle?: string;
  modalDescription?: string;
  placeholder?: string;
}

const EditTitleModal: React.FC<EditTitleModalProps> = ({
  open,
  onCancel,
  onConfirm,
  initialTitle = "",
  modalTitle = "编辑标题",
  modalDescription = "输入新的标题",
  placeholder = "请输入标题",
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setError(null);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [open, initialTitle]);

  const handleSubmit = useMemoizedFn(() => {
    if (!title.trim()) {
      setError("标题不能为空");
      return;
    }

    onConfirm({ title: title.trim() });
  });

  const handleKeyDown = useMemoizedFn((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel();
    } else if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      handleSubmit();
    }
  });

  if (!open) return null;

  return createPortal(
    <div
      className="z-9999 fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div className="m-4 w-full max-w-[460px]" onClick={e => e.stopPropagation()}>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
          <div className="mb-5 flex items-center gap-3">
            <div className="border-[var(--th-border-focus)]/30 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border bg-blue-50 dark:bg-blue-500/20">
              <svg
                className="h-5 w-5 text-[var(--th-accent)]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">
                {modalTitle}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">{modalDescription}</p>
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
            <div className="relative">
              <textarea
                ref={inputRef}
                value={title}
                onChange={e => {
                  setTitle(e.target.value);
                  setError(null);
                }}
                placeholder={placeholder}
                rows={4}
                className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-zinc-700"
                onClick={onCancel}
              >
                取消
              </button>
              <button
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-[var(--th-btn-bg)] px-5 py-3 text-sm font-semibold text-[var(--th-btn-text)] shadow-sm transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
                onClick={handleSubmit}
                disabled={!title.trim()}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default EditTitleModal;
