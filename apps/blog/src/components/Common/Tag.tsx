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
    "tag",
    {
      "px-2 py-0.5 text-xs": size === "sm",
      "px-3 py-1 text-sm": size === "md",
    },
    active && "active",
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
