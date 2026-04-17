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
  "w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)] disabled:opacity-60 disabled:cursor-not-allowed";

const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400";

const PresetModal: React.FC<PresetModalProps> = ({
  open,
  onClose,
  onSubmit,
  initial,
  title,
}) => {
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
        className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={() => !submitting && onClose()}
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
                <MdTimer className="w-5 h-5 text-indigo-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold m-0 text-gray-800 dark:text-white">
                  {resolvedTitle}
                </h2>
                <p className="text-xs mt-0.5 text-gray-500 dark:text-slate-500">
                  设置番茄钟名称与时长
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="shrink-0 w-8 h-8 rounded-lg border-none cursor-pointer flex items-center justify-center transition-all bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-slate-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <MdClose className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto event-modal-scroll pr-1 min-h-0">
              <div className="space-y-4">
                {/* 名称 */}
                <div className="flex flex-col gap-1.5">
                  <label className={LABEL_CLASS}>名称</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
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
                    ).map((opt) => {
                      const active = mode === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setMode(opt.value)}
                          className={`px-4 py-3 rounded-xl text-sm font-medium transition-all border ${
                            active
                              ? "bg-indigo-500 text-white border-indigo-500 shadow-[0_4px_14px_rgba(99,102,241,0.35)]"
                              : "bg-gray-50 dark:bg-zinc-950 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-zinc-800"
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
                      onChange={(e) => {
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
                      onKeyDown={(e) => {
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
            <div className="flex justify-end items-center gap-2 pt-4 mt-4 border-t border-white/20 dark:border-white/10 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-5 py-3.5 rounded-xl text-sm font-semibold cursor-pointer transition-all bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-zinc-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="px-5 py-3.5 rounded-xl border-none text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 transition-all bg-indigo-500 text-white shadow-[0_4px_14px_rgba(99,102,241,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-indigo-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:translate-y-0"
              >
                {submitting ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
};

export default PresetModal;
