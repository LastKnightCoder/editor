import { memo } from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";

interface SelectionCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  size?: "sm" | "md";
  interactive?: boolean;
}

export const SelectionCheckbox = memo<SelectionCheckboxProps>(
  ({
    checked,
    indeterminate = false,
    onChange,
    size = "md",
    interactive = true,
  }) => {
    const themeColors = useThemeColors();
    const sizeClass = size === "sm" ? "w-4 h-4" : "w-5 h-5";
    const iconSize = size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3";
    const className = classNames(
      sizeClass,
      "rounded-md border-2 flex items-center justify-center transition-all flex-shrink-0",
      checked || indeterminate
        ? [themeColors.buttonBg, "border-transparent"]
        : [
            "border-gray-300 dark:border-gray-600",
            "hover:border-gray-400 dark:hover:border-gray-500",
          ],
    );
    const content = (
      <>
        {checked && (
          <svg
            className={classNames(iconSize, themeColors.buttonTextClass)}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
        {indeterminate && !checked && (
          <div
            className={classNames(
              "w-2 h-0.5 rounded-full",
              themeColors.buttonTextClass.replace("text-", "bg-"),
            )}
          />
        )}
      </>
    );

    if (!interactive) {
      return (
        <span className={className} aria-hidden="true">
          {content}
        </span>
      );
    }

    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onChange();
        }}
        className={className}
      >
        {content}
      </button>
    );
  },
);

SelectionCheckbox.displayName = "SelectionCheckbox";
