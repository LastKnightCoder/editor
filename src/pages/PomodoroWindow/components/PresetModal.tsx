import React, { useEffect, useState } from "react";
import { PomodoroMode, PomodoroPreset } from "@/types";
import { useMemoizedFn } from "ahooks";

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

const PresetModal: React.FC<PresetModalProps> = ({
  open,
  onClose,
  onSubmit,
  initial,
  title,
}) => {
  const [name, setName] = useState(initial?.name || "");
  const [mode, setMode] = useState<PomodoroMode>(
    (initial?.mode as PomodoroMode) || "countdown",
  );
  const [duration, setDuration] = useState<number>(initial?.durationMin ?? 25);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial?.name || "");
      setMode((initial?.mode as PomodoroMode) || "countdown");
      setDuration(initial?.durationMin ?? 25);
    }
  }, [open, initial]);

  const handleOk = useMemoizedFn(async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        mode,
        durationMin: mode === "countdown" ? duration : undefined,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded shadow-lg w-[420px] p-4">
        <div className="text-lg font-semibold mb-3">
          {title || (initial?.id ? "编辑预设" : "新建预设")}
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">名称</label>
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：具体数学"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">计时模式</label>
            <div className="flex items-center gap-4 text-sm">
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  className="accent-blue-600"
                  checked={mode === "countdown"}
                  onChange={() => setMode("countdown")}
                />
                倒计时
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  className="accent-blue-600"
                  checked={mode === "countup"}
                  onChange={() => setMode("countup")}
                />
                正计时
              </label>
            </div>
          </div>
          {mode === "countdown" && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                倒计时分钟
              </label>
              <input
                className="w-32 border rounded px-2 py-1 text-sm"
                type="number"
                min={1}
                max={600}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="px-3 py-1 rounded border"
            onClick={onClose}
            disabled={submitting}
          >
            取消
          </button>
          <button
            className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
            onClick={handleOk}
            disabled={submitting}
          >
            {submitting ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PresetModal;
