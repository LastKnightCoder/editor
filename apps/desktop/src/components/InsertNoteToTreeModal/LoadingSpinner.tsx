import { memo } from "react";
import useThemeColors from "@/hooks/useThemeColors";

interface LoadingSpinnerProps {
  size?: "small" | "medium" | "large";
  className?: string;
}

const sizeClasses = {
  small: "w-4 h-4 border-2",
  medium: "w-6 h-6 border-2",
  large: "w-8 h-8 border-[3px]",
};

const LoadingSpinner = memo((props: LoadingSpinnerProps) => {
  const { size = "medium", className = "" } = props;
  const { accentColor } = useThemeColors();

  return (
    <div
      className={`${sizeClasses[size]} animate-spin rounded-full border-gray-200 dark:border-gray-700 ${className}`}
      style={{ borderTopColor: accentColor }}
    />
  );
});

LoadingSpinner.displayName = "LoadingSpinner";

export default LoadingSpinner;
