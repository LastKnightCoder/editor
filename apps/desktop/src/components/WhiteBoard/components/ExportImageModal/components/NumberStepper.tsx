import { useState, useEffect, useMemo } from "react";
import { useMemoizedFn } from "ahooks";

interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
}

const formatValue = (value: number, precision: number) => {
  if (Number.isNaN(value)) return "";
  return precision > 0 ? value.toFixed(precision) : String(Math.round(value));
};

const clamp = (value: number, min?: number, max?: number) => {
  let result = value;
  if (typeof min === "number" && result < min) result = min;
  if (typeof max === "number" && result > max) result = max;
  return result;
};

const NumberStepper = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  precision = 0,
}: NumberStepperProps) => {
  const [inputValue, setInputValue] = useState(() => formatValue(value, precision));

  useEffect(() => {
    setInputValue(formatValue(value, precision));
  }, [value, precision]);

  const canDecrease = useMemo(
    () => typeof min !== "number" || value - step >= min - 1e-9,
    [value, min, step]
  );
  const canIncrease = useMemo(
    () => typeof max !== "number" || value + step <= max + 1e-9,
    [value, max, step]
  );

  const applyStep = useMemoizedFn((delta: number) => {
    const next = clamp(value + delta, min, max);
    onChange(next);
    setInputValue(formatValue(next, precision));
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);

    if (raw === "" || raw === "-") return;

    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) return;

    const clamped = clamp(parsed, min, max);
    onChange(clamped);
  };

  const handleBlur = () => {
    const parsed = parseFloat(inputValue);
    if (Number.isNaN(parsed)) {
      setInputValue(formatValue(value, precision));
      return;
    }
    const clamped = clamp(parsed, min, max);
    onChange(clamped);
    setInputValue(formatValue(clamped, precision));
  };

  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-inner transition-all focus-within:border-[var(--th-border-focus)] focus-within:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(59,130,246,0.15)] dark:border-slate-700 dark:bg-zinc-950 dark:focus-within:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(59,130,246,0.25)]">
      <button
        type="button"
        onClick={() => applyStep(-step)}
        disabled={!canDecrease}
        className="flex w-10 cursor-pointer items-center justify-center border-none text-gray-500 transition-all hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-zinc-800 dark:hover:text-slate-200"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M5 12h14" />
        </svg>
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        className="w-16 border-none bg-transparent px-1 py-2.5 text-center text-sm text-gray-800 outline-none dark:text-white"
      />
      <button
        type="button"
        onClick={() => applyStep(step)}
        disabled={!canIncrease}
        className="flex w-10 cursor-pointer items-center justify-center border-none text-gray-500 transition-all hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-zinc-800 dark:hover:text-slate-200"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
};

export default NumberStepper;
