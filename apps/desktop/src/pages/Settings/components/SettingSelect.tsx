import React from "react";

interface SelectOption {
  label: string;
  value: string;
}

interface SettingSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  className?: string;
}

const SettingSelect: React.FC<SettingSelectProps> = ({
  label,
  value,
  onChange,
  options,
  disabled = false,
  className = "",
}) => {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full py-2.5 pl-3.5 pr-9 rounded-xl text-sm outline-none
            appearance-none cursor-pointer transition-all
            bg-gray-50 dark:bg-zinc-950
            border border-gray-200 dark:border-slate-700
            text-gray-800 dark:text-white
            focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]
            dark:focus:shadow-[0_0_0_3px_rgba(59,130,246,0.25)]
            disabled:opacity-60 disabled:cursor-not-allowed
            [&_option]:dark:bg-zinc-900 [&_option]:dark:text-white
            ${className}`}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-400 dark:text-slate-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>
  );
};

export default SettingSelect;
