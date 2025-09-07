import React from "react";
import classNames from "classnames";
import { MdStar, MdStarHalf, MdStarBorder } from "react-icons/md";

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
  console.log("normalizeValue", val, max, step);
  if (val === null || val === undefined || Number.isNaN(Number(val))) return 0;
  const num = typeof val === "number" ? val : Number(val);
  const rounded = step === 0.5 ? Math.round(num * 2) / 2 : Math.round(num);
  return clamp(rounded, 0, max);
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

  const handleMove =
    (index: number) => (e: React.MouseEvent<HTMLButtonElement>) => {
      if (readonly) return;
      const rect = (
        e.currentTarget as HTMLButtonElement
      ).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const half = x <= rect.width / 2 ? 0.5 : 1;
      const next = step === 0.5 ? index - 1 + half : index;
      const normalized = clamp(next, 0, max);
      setHoverValue(normalized);
    };

  const handleLeave = () => {
    if (readonly) return;
    setHoverValue(null);
  };

  const handleClick =
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
      onChange?.(normalized);
    };

  const stopDouble = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const containerCls = classNames(
    "inline-flex items-center gap-1 select-none",
    {
      "cursor-pointer": !readonly,
      "cursor-default": readonly,
    },
    className,
  );

  return (
    <div className={containerCls} onDoubleClick={stopDouble}>
      {Array.from({ length: max }).map((_, idx) => {
        const index = idx + 1;
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
            key={idx}
            type="button"
            className={classNames(
              "p-0 m-0 appearance-none bg-transparent border-0 leading-none",
              {
                "text-yellow-500 hover:text-yellow-500/90": theme === "light",
                "text-yellow-400 hover:text-yellow-300": theme === "dark",
              },
            )}
            onMouseMove={handleMove(index)}
            onMouseLeave={handleLeave}
            onClick={handleClick(index)}
          >
            <IconComp size={size} />
          </button>
        );
      })}
    </div>
  );
};

export default Star;
