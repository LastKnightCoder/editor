import { memo, Fragment } from "react";
import classNames from "classnames";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

const Breadcrumb = memo(({ items }: BreadcrumbProps) => {
  return (
    <nav className="flex items-center gap-1 text-sm" aria-label="面包屑导航">
      {/* 首页图标 */}
      <a
        href={items[0]?.href || "/"}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-canvas)] hover:text-[var(--color-primary)]"
        aria-label="首页"
      >
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
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
      </a>

      {items.slice(1).map((item, index) => (
        <Fragment key={item.href || `${item.label}-${index}`}>
          {/* 分隔符 */}
          <svg
            className="h-4 w-4 text-[var(--color-text-quaternary)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 4.5l7.5 7.5-7.5 7.5"
            />
          </svg>

          {/* 面包屑项 */}
          {index === items.length - 2 || !item.href ? (
            // 最后一项（当前页）
            <span className="flex items-center rounded-lg bg-[var(--color-bg-canvas)] px-3 py-1.5 font-medium text-[var(--color-text-primary)]">
              {item.label}
            </span>
          ) : (
            // 中间项
            <a
              href={item.href}
              className={classNames(
                "flex items-center rounded-lg px-3 py-1.5 text-[var(--color-text-tertiary)] transition-colors",
                "hover:bg-[var(--color-bg-canvas)] hover:text-[var(--color-primary)]",
              )}
            >
              {item.label}
            </a>
          )}
        </Fragment>
      ))}
    </nav>
  );
});

Breadcrumb.displayName = "Breadcrumb";

export default Breadcrumb;
