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
      const pages: (number | "ellipsis")[] = [];

      // 始终显示第一页
      pages.push(1);

      // 中间页码
      const start = Math.max(2, current - 1);
      const end = Math.min(totalPages - 1, current + 1);

      if (start > 2) pages.push("ellipsis");

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages - 1) pages.push("ellipsis");

      // 始终显示最后一页
      if (totalPages > 1) pages.push(totalPages);

      return pages;
    };

    return (
      <nav className="flex items-center justify-center gap-1">
        {/* 上一页 */}
        <a
          href={current > 1 ? getPageUrl(current - 1) : undefined}
          className={classNames(
            "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
            current > 1
              ? "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-canvas)]"
              : "pointer-events-none text-[var(--color-text-quaternary)]",
          )}
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </a>

        {/* 页码 */}
        {renderPageNumbers().map((page, index) =>
          page === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="flex h-9 w-9 items-center justify-center text-[var(--color-text-tertiary)]"
            >
              ...
            </span>
          ) : (
            <a
              key={page}
              href={getPageUrl(page)}
              className={classNames(
                "flex h-9 w-9 items-center justify-center rounded-lg text-sm transition-colors",
                page === current
                  ? "bg-[var(--color-primary)] text-white font-medium"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-canvas)]",
              )}
            >
              {page}
            </a>
          ),
        )}

        {/* 下一页 */}
        <a
          href={current < totalPages ? getPageUrl(current + 1) : undefined}
          className={classNames(
            "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
            current < totalPages
              ? "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-canvas)]"
              : "pointer-events-none text-[var(--color-text-quaternary)]",
          )}
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </a>
      </nav>
    );
  },
);

Pagination.displayName = "Pagination";

export default Pagination;
