import { memo, ReactNode } from "react";
import useThemeColors from "@/hooks/useThemeColors";

interface EmptyStateProps {
  description?: string;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

const EmptyState = memo((props: EmptyStateProps) => {
  const { description = "暂无数据", icon, className = "", children } = props;
  const { secondaryTextClass, iconTextClass } = useThemeColors();

  return (
    <div className={`flex flex-col items-center justify-center py-8 ${className}`}>
      {icon || (
        <svg
          className={`mb-3 h-12 w-12 opacity-40 ${iconTextClass}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
      )}
      <p className={`m-0 text-sm ${secondaryTextClass}`}>{description}</p>
      {children}
    </div>
  );
});

EmptyState.displayName = "EmptyState";

export default EmptyState;
