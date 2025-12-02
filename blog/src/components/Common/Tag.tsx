import { memo } from "react";
import classNames from "classnames";

interface TagProps {
  name: string;
  href?: string;
  size?: "sm" | "md";
  active?: boolean;
}

const Tag = memo(({ name, href, size = "sm", active = false }: TagProps) => {
  const className = classNames(
    "inline-flex items-center rounded-full transition-colors",
    {
      "px-2 py-0.5 text-xs": size === "sm",
      "px-3 py-1 text-sm": size === "md",
      "bg-[var(--color-primary)] text-white": active,
      "bg-[var(--color-tag-bg)] text-[var(--color-tag-text)] hover:bg-[var(--color-primary)]/20":
        !active,
    },
  );

  if (href) {
    return (
      <a href={href} className={className}>
        {name}
      </a>
    );
  }

  return <span className={className}>{name}</span>;
});

Tag.displayName = "Tag";

export default Tag;
