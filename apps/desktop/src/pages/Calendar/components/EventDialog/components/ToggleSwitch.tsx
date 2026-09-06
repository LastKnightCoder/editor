import { FC } from "react";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}

const ToggleSwitch: FC<ToggleSwitchProps> = ({ checked, onChange, disabled = false, label }) => {
  return (
    <div className="flex items-center gap-3">
      {/* Toggle Switch */}
      <label className={`group relative ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          disabled={disabled}
          className="peer sr-only"
        />
        <div
          className={`h-6 w-11 rounded-full transition-all duration-200 ease-in-out ${checked ? "bg-[var(--th-accent)]" : "bg-gray-200 dark:bg-zinc-700"} ${
            disabled ? "cursor-not-allowed opacity-50" : "group-hover:shadow-md"
          } peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--th-accent)] peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-slate-900`}
        >
          <div
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${checked ? "translate-x-5" : "translate-x-0"} `}
          />
        </div>
      </label>

      {/* Label */}
      <span
        className={`select-none text-sm ${
          disabled ? "text-gray-400 dark:text-slate-500" : "text-gray-700 dark:text-slate-300"
        }`}
      >
        {label}
      </span>
    </div>
  );
};

export default ToggleSwitch;
