import { memo } from "react";
import clsx from "clsx";

interface SelectionCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  /** interactive={false} 的纯展示用法无需传 */
  onChange?: () => void;
  size?: "sm" | "md";
  interactive?: boolean;
}

export const SelectionCheckbox = memo<SelectionCheckboxProps>(
  ({ checked, indeterminate = false, onChange, size = "md", interactive = true }) => {
    const on = checked || indeterminate;
    const className = clsx(
      size === "sm" ? "size-4" : "size-[18px]",
      "flex shrink-0 items-center justify-center rounded-[5px] transition-colors",
      on ? "bg-accent" : "bg-surface shadow-[inset_0_0_0_1.5px_var(--tau-bg-track)]"
    );
    const content = (
      <>
        {checked && (
          <svg
            className={clsx(size === "sm" ? "size-2.5" : "size-3", "text-ink-inverse")}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
        {indeterminate && !checked && (
          <span className="bg-ink-inverse h-[1.8px] w-2 rounded-full" />
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
        role="checkbox"
        aria-checked={indeterminate && !checked ? "mixed" : checked}
        onClick={e => {
          e.stopPropagation();
          onChange?.();
        }}
        className={className}
      >
        {content}
      </button>
    );
  }
);

SelectionCheckbox.displayName = "SelectionCheckbox";
