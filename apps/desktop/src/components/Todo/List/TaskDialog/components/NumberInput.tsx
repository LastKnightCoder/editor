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
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type="number"
        value={value ?? ""}
        onChange={handleChange}
        min={min}
        max={max}
        placeholder={placeholder}
        className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)]"
      />
    </div>
  );
};

export default NumberInput;
