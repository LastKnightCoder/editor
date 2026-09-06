import React, { forwardRef } from "react";
import useThemeColors from "@/hooks/useThemeColors";

interface SettingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
}

const SettingInput = forwardRef<HTMLInputElement, SettingInputProps>(
  ({ label, description, className = "", ...props }, ref) => {
    const themeColors = useThemeColors();

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full rounded-xl px-4 py-3.5 text-sm outline-none transition-all ${themeColors.inputBgClass} border border-gray-200 text-gray-800 shadow-inner placeholder:text-gray-400 focus:border-gray-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-slate-500 ${className}`}
          {...props}
        />
        {description && <p className="text-xs text-gray-500 dark:text-slate-400">{description}</p>}
      </div>
    );
  }
);

SettingInput.displayName = "SettingInput";

export default SettingInput;
