import { memo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { MdClose, MdEdit } from "react-icons/md";
import { useMemoizedFn } from "ahooks";
import { PomodoroSession } from "@/types";
import "@/pages/Calendar/components/EventDialog/index.css";

interface EditSessionModalProps {
  session: PomodoroSession | null;
  open: boolean;
  onCancel: () => void;
  onOk: (focusMs: number) => Promise<void>;
}

const INPUT_CLASS =
  "w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)] disabled:opacity-60 disabled:cursor-not-allowed";

const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400";

const EditSessionModal = memo(
  ({ session, open, onCancel, onOk }: EditSessionModalProps) => {
    const [focusMinutes, setFocusMinutes] = useState<number | "">("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      if (session && open) {
        const minutes = Math.max(1, Math.round(session.focusMs / 60000));
        setFocusMinutes(minutes);
      }
    }, [session, open]);

    const isValid =
      typeof focusMinutes === "number" &&
      Number.isFinite(focusMinutes) &&
      focusMinutes >= 1;
    const canSubmit = isValid && !loading;

    const handleOk = useMemoizedFn(async () => {
      if (!canSubmit) return;
      try {
        setLoading(true);
        const focusMs = (focusMinutes as number) * 60000;
        await onOk(focusMs);
      } catch (error) {
        console.error("Failed to update session:", error);
      } finally {
        setLoading(false);
      }
    });

    const handleCancel = () => {
      if (loading) return;
      onCancel();
    };

    if (!open) return null;

    return createPortal(
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={handleCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full max-w-[480px] m-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-2xl p-6 shadow-2xl bg-white dark:bg-zinc-900/95 border border-gray-200 dark:border-slate-800 flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-start gap-3 mb-5 shrink-0">
                <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30">
                  <MdEdit className="w-5 h-5 text-indigo-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                    编辑专注记录
                  </h2>
                  <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                    调整本次番茄钟的专注时长
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={loading}
                  className="shrink-0 w-8 h-8 rounded-lg border-none cursor-pointer flex items-center justify-center transition-all bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-slate-200 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <MdClose className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <div className="flex-1 overflow-y-auto event-modal-scroll pr-1 min-h-0">
                <div className="flex flex-col gap-1.5">
                  <label className={LABEL_CLASS}>专注时长（分钟）</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={focusMinutes}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        setFocusMinutes("");
                        return;
                      }
                      const v = Number(raw);
                      if (Number.isFinite(v)) {
                        setFocusMinutes(Math.floor(v));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canSubmit) {
                        e.preventDefault();
                        handleOk();
                      }
                    }}
                    placeholder="请输入专注时长"
                    className={INPUT_CLASS}
                    autoFocus
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end items-center gap-2 pt-4 mt-4 border-t border-white/20 dark:border-white/10 shrink-0">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={loading}
                  className="px-5 py-3.5 rounded-xl text-sm font-semibold cursor-pointer transition-all bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-zinc-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleOk}
                  disabled={!canSubmit}
                  className="px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-indigo-500 text-white shadow-[0_4px_14px_rgba(99,102,241,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-indigo-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:translate-y-0"
                >
                  {loading ? "保存中..." : "确认"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>,
      document.body,
    );
  },
);

EditSessionModal.displayName = "EditSessionModal";

export default EditSessionModal;
