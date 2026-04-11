import { memo } from "react";
import classNames from "classnames";

interface PaginationProps {
  current: number;
  total: number;
  pageSize: number;
  basePath: string;
}

const Pagination = memo(
  ({ current, total, pageSize, basePath }: PaginationProps) => {
    const totalPages = Math.ceil(total / pageSize);

    if (totalPages <= 1) return null;

    const getPageUrl = (page: number) => {
      if (page === 1) return basePath;
      return `${basePath}?page=${page}`;
    };

    const renderPageNumbers = () => {
      const pages: (number | "ellipsis-start" | "ellipsis-end")[] = [];
      pages.push(1);
      const start = Math.max(2, current - 1);
      const end = Math.min(totalPages - 1, current + 1);
      if (start > 2) pages.push("ellipsis-start");
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (end < totalPages - 1) pages.push("ellipsis-end");
      if (totalPages > 1) pages.push(totalPages);
      return pages;
    };

    const ArrowButton = ({
      direction,
      disabled,
      href,
    }: {
      direction: "prev" | "next";
      disabled: boolean;
      href?: string;
    }) => {
      const isPrev = direction === "prev";
      const baseClasses = classNames(
        "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
        disabled
          ? "pointer-events-none text-[var(--color-text-quaternary)]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-canvas)] hover:text-[var(--color-text-primary)]",
      );

      const icon = (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d={isPrev ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"}
          />
        </svg>
      );

      if (disabled) {
        return <span className={baseClasses}>{icon}</span>;
      }

      return (
        <a href={href} className={baseClasses}>
          {icon}
        </a>
      );
    };

    return (
      <nav className="flex items-center justify-center gap-1">
        <ArrowButton
          direction="prev"
          disabled={current <= 1}
          href={current > 1 ? getPageUrl(current - 1) : undefined}
        />

        <div className="flex items-center gap-1 px-1">
          {renderPageNumbers().map((page) =>
            typeof page === "string" ? (
              <span
                key={page}
                className="flex h-9 w-9 items-center justify-center text-[var(--color-text-tertiary)]"
              >
                &hellip;
              </span>
            ) : (
              <a
                key={page}
                href={getPageUrl(page)}
                className={classNames(
                  "flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-colors",
                  page === current
                    ? "bg-[var(--color-primary)] text-[var(--color-text-inverse)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-canvas)] hover:text-[var(--color-text-primary)]",
                )}
              >
                {page}
              </a>
            ),
          )}
        </div>

        <ArrowButton
          direction="next"
          disabled={current >= totalPages}
          href={current < totalPages ? getPageUrl(current + 1) : undefined}
        />
      </nav>
    );
  },
);

Pagination.displayName = "Pagination";

export default Pagination;
