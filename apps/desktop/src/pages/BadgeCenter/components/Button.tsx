import type { ReactNode } from "react";
import { motion } from "motion/react";
import useThemeColors from "@/hooks/useThemeColors";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  variant?: Variant;
  size?: "sm" | "md";
  className?: string;
  title?: string;
}

const Button = ({
  children,
  onClick,
  disabled,
  type = "button",
  variant = "secondary",
  size = "md",
  className = "",
  title,
}: ButtonProps) => {
  const themeColors = useThemeColors();
  const height = size === "sm" ? "h-8 px-4 text-xs" : "h-11 px-6 text-sm";

  const variantClass =
    variant === "primary"
      ? `${themeColors.primaryButtonClass} shadow-lg shadow-black/10`
      : variant === "ghost"
        ? `${themeColors.textClass} ${themeColors.hoverClass}`
        : variant === "danger"
          ? "bg-red-500/15 text-red-500 hover:bg-red-500/25 border border-red-500/30"
          : `${themeColors.tagBgClass} ${themeColors.activeTextClass} ${themeColors.hoverClass} border ${themeColors.borderClass}`;

  return (
    <motion.button
      type={type}
      disabled={disabled}
      onClick={onClick}
      title={title}
      whileHover={disabled ? undefined : { scale: 1.03 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${height} ${variantClass} ${className}`}
    >
      {children}
    </motion.button>
  );
};

export default Button;
