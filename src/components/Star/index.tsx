import React from "react";
import classNames from "classnames";
import { MdStar, MdStarHalf, MdStarBorder } from "react-icons/md";
import { useMemoizedFn } from "ahooks";

export interface StarProps {
  value: number | null;
  onChange?: (value: number | null) => void;
  max?: number;
  step?: 0.5 | 1;
  readonly?: boolean;
  theme?: "light" | "dark";
  className?: string;
  size?: number;
}

const clamp = (val: number, min: number, max: number) =>
  Math.min(max, Math.max(min, val));

const normalizeValue = (
  val: number | null | undefined,
  max: number,
  step: 0.5 | 1,
) => {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return 0;
  const num = typeof val === "number" ? val : Number(val);
  const rounded = step === 0.5 ? Math.round(num * 2) / 2 : Math.round(num);
  return clamp(rounded, 0, max);
};

interface IconCompProps {
  index: number;
  displayValue: number;
  theme: "light" | "dark";
  handleMove: (e: React.MouseEvent<HTMLButtonElement | HTMLDivElement>) => void;
  handleLeave: () => void;
  handleClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  size: number;
}

const IconComp = ({
  index,
  displayValue,
  theme,
  handleMove,
  handleLeave,
  handleClick,
  size,
}: IconCompProps) => {
  let IconComp: React.ComponentType<{
    className?: string;
    size?: number;
  }> = MdStarBorder;
  if (displayValue >= index) {
    IconComp = MdStar;
  } else if (displayValue >= index - 0.5) {
    IconComp = MdStarHalf;
  }

  return (
    <button
      type="button"
      className={classNames(
        "p-0 m-0 appearance-none bg-transparent border-0 leading-none",
        {
          "text-yellow-500 hover:text-yellow-500/90": theme === "light",
          "text-yellow-400 hover:text-yellow-300": theme === "dark",
        },
      )}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={handleClick}
    >
      <IconComp size={size} />
    </button>
  );
};

const Star: React.FC<StarProps> = ({
  value,
  onChange,
  max = 5,
  step = 0.5,
  readonly = false,
  theme = "light",
  className,
  size = 18,
}) => {
  const [hoverValue, setHoverValue] = React.useState<number | null>(null);

  const displayValue = React.useMemo(
    () => normalizeValue(hoverValue ?? value ?? 0, max, step),
    [hoverValue, value, max, step],
  );

  const handleMove = useMemoizedFn(
    (index: number) =>
      (e: React.MouseEvent<HTMLButtonElement | HTMLDivElement>) => {
        if (readonly) return;
        const rect = (
          e.currentTarget as HTMLButtonElement
        ).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const half = x <= rect.width / 2 ? 0.5 : 1;
        const next = step === 0.5 ? index - 1 + half : index;
        const normalized = clamp(next, 0, max);
        setHoverValue(normalized);
      },
  );

  const handleLeave = useMemoizedFn(() => {
    if (readonly) return;
    setHoverValue(null);
  });

  const handleClick = useMemoizedFn(
    (index: number) => (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.preventDefault();
      if (readonly) return;
      const rect = (
        e.currentTarget as HTMLButtonElement
      ).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const half = x <= rect.width / 2 ? 0.5 : 1;
      const next = step === 0.5 ? index - 1 + half : index;
      const normalized = clamp(next, 0, max);
      const current = normalizeValue(value ?? 0, max, step);
      onChange?.(current === normalized ? 0 : normalized);
    },
  );

  const stopDouble = useMemoizedFn((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
  });

  const containerCls = classNames(
    "flex items-center select-none",
    {
      "cursor-pointer": !readonly,
      "cursor-default": readonly,
    },
    className,
  );

  return (
    <div
      className={containerCls}
      onDoubleClick={stopDouble}
      onMouseLeave={handleLeave}
    >
      {Array.from({ length: max }).map((_, idx) => {
        const index = idx + 1;

        return (
          <IconComp
            key={idx}
            index={index}
            displayValue={displayValue}
            theme={theme}
            handleMove={handleMove(index)}
            handleLeave={handleLeave}
            handleClick={handleClick(index)}
            size={size}
          />
        );
      })}
    </div>
  );
};

export default Star;
