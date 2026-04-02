import React from "react";
import useThemeColors from "@/hooks/useThemeColors";

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
  const themeColors = useThemeColors();

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
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full
          border-2 border-transparent transition-colors duration-200 ease-in-out
          focus:outline-none ${themeColors.focusRingClass}
          dark:focus:ring-offset-slate-900
          disabled:cursor-not-allowed
          ${checked ? themeColors.buttonBg : "bg-gray-200 dark:bg-zinc-700"}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full
            bg-white shadow ring-0 transition duration-200 ease-in-out
            ${checked ? "translate-x-5" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
};

export default SettingSwitch;
