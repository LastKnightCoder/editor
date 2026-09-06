import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { MdClose } from "react-icons/md";

interface EditDocumentModalProps {
  open: boolean;
  title: string;
  onCancel: () => void;
  onOk: (title: string, desc: string) => void;
  defaultTitle: string;
  defaultDesc: string;
}

const EditDocumentModal = (props: EditDocumentModalProps) => {
  const { open, title, onCancel, onOk, defaultTitle, defaultDesc } = props;
  const [documentTitle, setDocumentTitle] = useState(defaultTitle);
  const [desc, setDesc] = useState(defaultDesc);

  useEffect(() => {
    if (open) {
      setDocumentTitle(defaultTitle);
      setDesc(defaultDesc);
    }
  }, [open, defaultTitle, defaultDesc]);

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="z-9999 fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="m-4 w-full max-w-[520px]"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
            {/* Header */}
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-indigo-200 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/20">
                <svg
                  className="h-5 w-5 text-indigo-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">{title}</h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">
                  创建一个新的知识库来组织文档
                </p>
              </div>
              <button
                onClick={onCancel}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 hover:text-gray-700 dark:bg-zinc-800 dark:text-slate-400 dark:hover:bg-zinc-700 dark:hover:text-slate-200"
              >
                <MdClose className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-4">
              {/* Title */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  标题
                </label>
                <input
                  type="text"
                  value={documentTitle}
                  onChange={e => setDocumentTitle(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                  placeholder="知识库名称"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  描述
                </label>
                <textarea
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
                  placeholder="简要描述知识库的内容和用途"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={onCancel}
                className="cursor-pointer rounded-xl border border-gray-200 bg-gray-100 px-5 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-200 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-200 dark:hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => onOk(documentTitle, desc)}
                className="cursor-pointer rounded-xl border-none bg-[var(--th-btn-bg)] px-5 py-3 text-sm font-semibold text-[var(--th-btn-text)] shadow-[0_4px_14px_rgba(99,102,241,0.35),0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0"
              >
                确定
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default EditDocumentModal;
