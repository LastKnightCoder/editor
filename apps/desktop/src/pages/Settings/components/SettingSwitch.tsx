import React from "react";

interface SettingSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

const SettingSwitch: React.FC<SettingSwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}) => {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-3 ${disabled ? "opacity-60" : ""}`}
    >
      {(label || description) && (
        <div className="flex-1">
          {label && (
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {label}
            </div>
          )}
          {description && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {description}
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5
          transition-colors duration-200 ease-in-out
          focus:outline-none focus:ring-2 focus:ring-zinc-400/30 dark:focus:ring-zinc-200/25
          disabled:cursor-not-allowed
          ${checked ? "bg-zinc-900 dark:bg-zinc-200" : "bg-gray-200 dark:bg-zinc-700"}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full
            bg-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] ring-1 ring-black/5 transition duration-200 ease-in-out
            ${checked ? "translate-x-5" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
};

export default SettingSwitch;
