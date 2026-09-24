import { memo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { MdClose, MdEdit } from "react-icons/md";
import { useMemoizedFn } from "ahooks";
import { PomodoroSession } from "@/types";
import "./modal-scroll.css";

interface EditSessionModalProps {
  session: PomodoroSession | null;
  open: boolean;
  onCancel: () => void;
  onOk: (focusMs: number) => Promise<void>;
}

const INPUT_CLASS =
  "w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] disabled:opacity-60 disabled:cursor-not-allowed";

const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400";

const EditSessionModal = memo(({ session, open, onCancel, onOk }: EditSessionModalProps) => {
  const [focusMinutes, setFocusMinutes] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session && open) {
      const minutes = Math.max(1, Math.round(session.focusMs / 60000));
      setFocusMinutes(minutes);
    }
  }, [session, open]);

  const isValid =
    typeof focusMinutes === "number" && Number.isFinite(focusMinutes) && focusMinutes >= 1;
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
        className="z-9999 fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={handleCancel}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="m-4 flex max-h-[90vh] w-full max-w-[480px] flex-col"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-zinc-900/95">
            {/* Header */}
            <div className="mb-5 flex shrink-0 items-start gap-3">
              <div className="border-[var(--th-border-focus)]/30 dark:border-[var(--th-border-focus)]/30 dark:bg-[var(--th-accent)]/20 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border bg-[var(--th-accent-soft)]">
                <MdEdit className="h-5 w-5 text-[var(--th-accent)]" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">
                  编辑专注记录
                </h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">
                  调整本次番茄钟的专注时长
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-800 dark:text-slate-400 dark:hover:bg-zinc-700 dark:hover:text-slate-200"
              >
                <MdClose className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <div className="event-modal-scroll min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="flex flex-col gap-1.5">
                <label className={LABEL_CLASS}>专注时长（分钟）</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={focusMinutes}
                  onChange={e => {
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
                  onKeyDown={e => {
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
            <div className="mt-4 flex shrink-0 items-center justify-end gap-2 border-t border-white/20 pt-4 dark:border-white/10">
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className="cursor-pointer rounded-xl border border-gray-200 bg-gray-100 px-5 py-3.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-200 dark:hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleOk}
                disabled={!canSubmit}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-[var(--th-btn-bg)] px-5 py-3.5 text-sm font-semibold text-[var(--th-btn-text)] shadow-[0_4px_14px_rgba(99,102,241,0.35),0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:hover:translate-y-0 dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
              >
                {loading ? "保存中..." : "确认"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
});

EditSessionModal.displayName = "EditSessionModal";

export default EditSessionModal;
