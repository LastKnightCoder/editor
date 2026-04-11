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
}

const levelIndent: Record<number, string> = {
  1: "pl-2.5",
  2: "pl-6",
  3: "pl-10",
};

const Outline = ({ headers, className, style, onClick }: OutlineProps) => {
  return (
    <nav
      className={classNames("flex flex-col gap-0.5", className)}
      style={style}
    >
      {headers.map((header, index) => (
        <button
          key={index}
          type="button"
          className={classNames(
            "rounded-md pr-2.5 py-1.5 text-left text-[13px] leading-normal text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-primary-subtle)] hover:text-[var(--color-text-primary)]",
            levelIndent[header.level] ?? "pl-2.5",
          )}
          onClick={() => onClick?.(index)}
        >
          {header.title}
        </button>
      ))}
    </nav>
  );
};

export default Outline;
