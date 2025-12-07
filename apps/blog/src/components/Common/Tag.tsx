import { memo } from "react";
import classNames from "classnames";

interface TagProps {
  name: string;
  href?: string;
  size?: "sm" | "md";
  active?: boolean;
}

const Tag = memo(({ name, href, size = "sm", active = false }: TagProps) => {
  const baseClasses = classNames(
    "inline-flex items-center gap-1.5 rounded-full font-medium transition-all duration-200",
    {
      "px-2.5 py-1 text-xs": size === "sm",
      "px-3.5 py-1.5 text-sm": size === "md",
    },
  );

  const stateClasses = active
    ? "bg-[var(--color-primary)] text-white shadow-sm shadow-[var(--color-primary)]/25"
    : "bg-[var(--color-tag-bg)] text-[var(--color-tag-text)] border border-[var(--color-tag-border)] hover:bg-[var(--color-primary-subtle)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]";

  const className = classNames(baseClasses, stateClasses);

  const content = (
    <>
      {/* 标签图标 */}
      <svg
        className={classNames("shrink-0", {
          "h-3 w-3": size === "sm",
          "h-3.5 w-3.5": size === "md",
        })}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5"
        />
      </svg>
      {name}
    </>
  );

  if (href) {
    return (
      <a href={href} className={className}>
        {content}
      </a>
    );
  }

  return <span className={className}>{content}</span>;
});

Tag.displayName = "Tag";

export default Tag;
