import { useEffect, useRef } from "react";
import classNames from "classnames";

interface HeaderItem {
  title: string;
  level: number;
}

interface OutlineProps {
  headers: HeaderItem[];
  className?: string;
  style?: React.CSSProperties;
  onClick?: (index: number) => void;
  activeIndex?: number;
}

const getLevelIndentRem = (level: number) => {
  if (level <= 1) return 0.625;
  if (level === 2) return 1.5;
  return 2.5 + Math.max(level - 3, 0);
};

const Outline = ({
  headers,
  className,
  style,
  onClick,
  activeIndex,
}: OutlineProps) => {
  const buttonRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());

  useEffect(() => {
    if (typeof activeIndex !== "number") {
      return;
    }
    const activeButton = buttonRefs.current.get(activeIndex);
    if (typeof activeButton?.scrollIntoView === "function") {
      activeButton.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  return (
    <nav
      className={classNames("flex flex-col gap-0.5", className)}
      style={style}
    >
      {headers.map((header, index) => (
        <button
          key={index}
          type="button"
          ref={(element) => {
            if (element) {
              buttonRefs.current.set(index, element);
              return;
            }
            buttonRefs.current.delete(index);
          }}
          aria-current={activeIndex === index ? "true" : undefined}
          data-outline-active={activeIndex === index ? "true" : undefined}
          className={classNames(
            "w-full rounded-md pr-2.5 py-1.5 text-left text-xs leading-normal transition-colors",
            activeIndex === index
              ? "bg-[var(--color-primary-subtle)] font-medium text-[var(--color-text-primary)]"
              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-subtle)] hover:text-[var(--color-text-primary)]",
          )}
          onClick={() => onClick?.(index)}
        >
          <span
            className="block"
            style={{ paddingLeft: `${getLevelIndentRem(header.level)}rem` }}
          >
            {header.title}
          </span>
        </button>
      ))}
    </nav>
  );
};

export default Outline;
