import { FC } from "react";

interface NumberInputProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  required?: boolean;
}

const NumberInput: FC<NumberInputProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
  required = false,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "") {
      onChange(null);
      return;
    }

    const numVal = parseInt(val, 10);
    if (!isNaN(numVal)) {
      if (min !== undefined && numVal < min) return;
      if (max !== undefined && numVal > max) return;
      onChange(numVal);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <input
        type="number"
        value={value ?? ""}
        onChange={handleChange}
        min={min}
        max={max}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500"
      />
    </div>
  );
};

export default NumberInput;
