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
    const className = clsx(
      size === "sm" ? "size-4" : "size-[18px]",
      "flex shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors",
      checked || indeterminate ? "border-accent bg-accent" : "border-ink-3 hover:border-ink-2"
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
        {indeterminate && !checked && <span className="bg-ink-inverse h-0.5 w-2 rounded-full" />}
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
