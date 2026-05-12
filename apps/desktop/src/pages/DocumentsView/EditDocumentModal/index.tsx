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
        className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="w-full max-w-[520px] m-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-zinc-900/95 border border-gray-200 dark:border-slate-800 flex flex-col">
            {/* Header */}
            <div className="flex items-start gap-3 mb-5">
              <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30">
                <svg
                  className="w-5 h-5 text-indigo-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                  {title}
                </h2>
                <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                  创建一个新的知识库来组织文档
                </p>
              </div>
              <button
                onClick={onCancel}
                className="shrink-0 w-8 h-8 rounded-lg border-none cursor-pointer flex items-center justify-center transition-all bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-slate-200"
              >
                <MdClose className="w-5 h-5" />
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
                  onChange={(e) => setDocumentTitle(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)]"
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
                  onChange={(e) => setDesc(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)] resize-none"
                  placeholder="简要描述知识库的内容和用途"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end items-center gap-2 pt-4 mt-4 border-t border-gray-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onCancel}
                className="px-5 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => onOk(documentTitle, desc)}
                className="px-5 py-3 rounded-xl border-none text-sm font-semibold cursor-pointer transition-all bg-indigo-500 text-white shadow-[0_4px_14px_rgba(99,102,241,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-indigo-600 hover:-translate-y-px active:translate-y-0"
              >
                确定
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
};

export default EditDocumentModal;
