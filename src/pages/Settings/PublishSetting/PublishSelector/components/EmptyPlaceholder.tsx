import { memo, ReactNode } from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";

interface EmptyPlaceholderProps {
  text: string;
  icon?: ReactNode;
}

export const EmptyPlaceholder = memo<EmptyPlaceholderProps>(
  ({ text, icon }) => {
    const themeColors = useThemeColors();

    return (
      <div
        className={classNames(
          "flex flex-col items-center justify-center rounded-xl border border-dashed p-8",
          themeColors.cardBorderClass,
          themeColors.cardBgClass,
        )}
      >
        {icon || (
          <svg
            className={classNames(
              "w-12 h-12 mb-3",
              themeColors.secondaryTextClass,
            )}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
        )}
        <p className={classNames("text-sm", themeColors.secondaryTextClass)}>
          {text}
        </p>
      </div>
    );
  },
);

EmptyPlaceholder.displayName = "EmptyPlaceholder";
