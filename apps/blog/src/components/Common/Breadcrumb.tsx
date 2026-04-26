import { memo, Fragment } from "react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

const Breadcrumb = memo(({ items }: BreadcrumbProps) => {
  if (items.length === 0) return null;

  return (
    <nav className="flex items-center gap-1.5 text-sm" aria-label="面包屑导航">
      {items.map((item, index) => (
        <Fragment key={item.href || `${item.label}-${index}`}>
          {index > 0 && (
            <span className="text-[var(--color-text-quaternary)]">/</span>
          )}
          {index === items.length - 1 || !item.href ? (
            <span className="font-medium text-[var(--color-text-primary)]">
              {item.label}
            </span>
          ) : (
            <a
              href={item.href}
              className="text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
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
