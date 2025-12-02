import { memo, Fragment } from "react";

interface BreadcrumbItem {
  label: string;
  href: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

const Breadcrumb = memo(({ items }: BreadcrumbProps) => {
  return (
    <nav className="flex items-center gap-2 text-sm">
      {items.map((item, index) => (
        <Fragment key={item.href}>
          {index > 0 && (
            <svg
              className="h-4 w-4 text-[var(--color-text-tertiary)]"
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
          )}
          {index === items.length - 1 ? (
            <span className="text-[var(--color-text-primary)]">
              {item.label}
            </span>
          ) : (
            <a
              href={item.href}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
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
