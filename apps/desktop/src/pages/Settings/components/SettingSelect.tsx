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
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full cursor-pointer appearance-none rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-3.5 pr-9 text-sm text-gray-800 outline-none transition-all focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:focus:shadow-[0_0_0_3px_rgba(59,130,246,0.25)] [&_option]:dark:bg-zinc-900 [&_option]:dark:text-white ${className}`}
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500"
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
