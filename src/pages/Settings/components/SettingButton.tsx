import React from "react";
import useThemeColors from "@/hooks/useThemeColors";

interface SettingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const SettingButton: React.FC<SettingButtonProps> = ({
  variant = "primary",
  loading = false,
  icon,
  children,
  className = "",
  disabled,
  ...props
}) => {
  const themeColors = useThemeColors();

  const baseClasses = `px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer
    flex items-center justify-center gap-2 transition-all
    disabled:cursor-not-allowed`;

  const variantClasses = {
    primary: `border-none ${themeColors.primaryButtonClass}
      hover:-translate-y-px active:translate-y-0
      disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:shadow-none`,
    secondary: `${themeColors.inputBgClass} ${themeColors.textClass}
      border ${themeColors.borderClass}
      ${themeColors.hoverClass}
      disabled:opacity-60`,
    danger: `border-none bg-red-500 text-white
      hover:bg-red-600 hover:-translate-y-px active:translate-y-0
      disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:shadow-none`,
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg
          className="animate-spin w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : (
        icon
      )}
      {children}
    </button>
  );
};

export default SettingButton;
