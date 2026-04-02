import { FC } from "react";
import { motion, HTMLMotionProps } from "motion/react";

interface IconButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  icon: React.ReactNode;
  active?: boolean;
  variant?: "default" | "primary";
}

const IconButton: FC<IconButtonProps> = ({
  icon,
  active = false,
  variant = "default",
  className = "",
  disabled = false,
  ...props
}) => {
  const baseClasses = `
    relative inline-flex items-center justify-center
    w-9 h-9 rounded-lg
    transition-all duration-200
    disabled:opacity-40 disabled:cursor-not-allowed
  `;

  const variantClasses =
    variant === "primary"
      ? `
        bg-indigo-500 text-white
        hover:bg-indigo-600 hover:shadow-lg
        active:bg-indigo-700
        disabled:hover:bg-indigo-500 disabled:hover:shadow-none
      `
      : active
        ? `
          bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400
          hover:bg-indigo-200 dark:hover:bg-indigo-500/30
        `
        : `
          bg-white dark:bg-zinc-800 text-gray-700 dark:text-slate-300
          border border-gray-200 dark:border-slate-700
          hover:bg-gray-50 dark:hover:bg-zinc-700
          hover:border-gray-300 dark:hover:border-slate-600
          hover:shadow-md
        `;

  return (
    <motion.button
      type="button"
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      className={`${baseClasses} ${variantClasses} ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon}
    </motion.button>
  );
};

export default IconButton;
