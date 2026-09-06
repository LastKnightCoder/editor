import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { MdClose, MdTimer } from "react-icons/md";
import { useMemoizedFn } from "ahooks";
import { PomodoroMode, PomodoroPreset } from "@/types";
import "@/pages/Calendar/components/EventDialog/index.css";

interface PresetModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    mode: PomodoroMode;
    durationMin?: number;
  }) => Promise<void> | void;
  initial?: Partial<PomodoroPreset>;
  title?: string;
}

const INPUT_CLASS =
  "w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] disabled:opacity-60 disabled:cursor-not-allowed";

const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400";

const PresetModal: React.FC<PresetModalProps> = ({ open, onClose, onSubmit, initial, title }) => {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<PomodoroMode>("countdown");
  const [durationMin, setDurationMin] = useState<number | "">(25);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial?.name || "");
      setMode((initial?.mode as PomodoroMode) || "countdown");
      setDurationMin(initial?.durationMin ?? 25);
    }
  }, [open, initial]);

  const isDurationValid =
    mode !== "countdown" ||
    (typeof durationMin === "number" &&
      Number.isFinite(durationMin) &&
      durationMin >= 1 &&
      durationMin <= 600);
  const canSubmit = !!name.trim() && isDurationValid && !submitting;

  const handleSubmit = useMemoizedFn(async () => {
    if (!canSubmit) return;
    try {
      setSubmitting(true);
      await onSubmit({
        name: name.trim(),
        mode,
        durationMin: mode === "countdown" ? (durationMin as number) : undefined,
      });
      onClose();
    } catch (error) {
      console.error("Failed to save preset:", error);
    } finally {
      setSubmitting(false);
    }
  });

  if (!open) return null;

  const resolvedTitle = title || (initial?.id ? "编辑番茄钟" : "新建番茄钟");

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="z-9999 fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={() => !submitting && onClose()}
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
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-indigo-200 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/20">
                <MdTimer className="h-5 w-5 text-indigo-500" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="m-0 text-base font-bold text-gray-800 dark:text-white">
                  {resolvedTitle}
                </h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-500">
                  设置番茄钟名称与时长
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-800 dark:text-slate-400 dark:hover:bg-zinc-700 dark:hover:text-slate-200"
              >
                <MdClose className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <div className="event-modal-scroll min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="space-y-4">
                {/* 名称 */}
                <div className="flex flex-col gap-1.5">
                  <label className={LABEL_CLASS}>名称</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && canSubmit) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    placeholder="如：具体数学"
                    className={INPUT_CLASS}
                    autoFocus
                  />
                </div>

                {/* 计时模式 */}
                <div className="flex flex-col gap-1.5">
                  <label className={LABEL_CLASS}>计时模式</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: "countdown", label: "倒计时" },
                        { value: "countup", label: "正计时" },
                      ] as { value: PomodoroMode; label: string }[]
                    ).map(opt => {
                      const active = mode === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setMode(opt.value)}
                          className={`rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                            active
                              ? "border-indigo-500 bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] shadow-[0_4px_14px_rgba(99,102,241,0.35)]"
                              : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-slate-700 dark:bg-zinc-950 dark:text-slate-300 dark:hover:bg-zinc-800"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 倒计时分钟 */}
                {mode === "countdown" && (
                  <div className="flex flex-col gap-1.5">
                    <label className={LABEL_CLASS}>倒计时分钟</label>
                    <input
                      type="number"
                      min={1}
                      max={600}
                      step={1}
                      value={durationMin}
                      onChange={e => {
                        const raw = e.target.value;
                        if (raw === "") {
                          setDurationMin("");
                          return;
                        }
                        const v = Number(raw);
                        if (Number.isFinite(v)) {
                          setDurationMin(v);
                        }
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter" && canSubmit) {
                          e.preventDefault();
                          handleSubmit();
                        }
                      }}
                      placeholder="25"
                      className={INPUT_CLASS}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-4 flex shrink-0 items-center justify-end gap-2 border-t border-white/20 pt-4 dark:border-white/10">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="cursor-pointer rounded-xl border border-gray-200 bg-gray-100 px-5 py-3.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-200 dark:hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-[var(--th-btn-bg)] px-5 py-3.5 text-sm font-semibold text-[var(--th-btn-text)] shadow-[0_4px_14px_rgba(99,102,241,0.35),0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:hover:translate-y-0 dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
              >
                {submitting ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default PresetModal;
