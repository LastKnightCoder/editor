import { FC } from "react";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}

const ToggleSwitch: FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
}) => {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      {/* Toggle Switch */}
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
        />
        <div
          className={`
            w-11 h-6 rounded-full transition-all duration-200 ease-in-out
            ${checked ? "bg-indigo-500" : "bg-gray-200 dark:bg-slate-700"}
            ${
              disabled
                ? "opacity-50 cursor-not-allowed"
                : "group-hover:shadow-md"
            }
            peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-slate-900
          `}
        >
          <div
            className={`
              absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md
              transition-transform duration-200 ease-in-out
              ${checked ? "translate-x-5" : "translate-x-0"}
            `}
          />
        </div>
      </div>

      {/* Label */}
      <span
        className={`text-sm select-none ${
          disabled
            ? "text-gray-400 dark:text-slate-500"
            : "text-gray-700 dark:text-slate-300"
        }`}
      >
        {label}
      </span>
    </label>
  );
};

export default ToggleSwitch;
