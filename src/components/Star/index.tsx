import React, { useState, useEffect, useRef, useMemo } from "react";
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
  size: number;
}

const IconComp = ({ index, displayValue, theme, size }: IconCompProps) => {
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
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isHovering, setIsHovering] = useState<boolean>(false);

  const displayValue = useMemo(
    () =>
      normalizeValue(isHovering ? (hoverValue ?? 0) : (value ?? 0), max, step),
    [hoverValue, value, max, step, isHovering],
  );

  const quantizeByStep = useMemoizedFn((raw: number) => {
    if (step === 0.5) {
      const v = Math.ceil(raw * 2) / 2;
      return clamp(v, 0.5, max);
    }
    const v = Math.ceil(raw);
    return clamp(v, 1, max);
  });

  const handleContainerMove = useMemoizedFn(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (readonly || !isHovering) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = clamp(x / rect.width, 0, 1);
      const raw = ratio * max;
      const next = quantizeByStep(raw);
      setHoverValue(next);
    },
  );

  const handleLeave = useMemoizedFn(() => {
    if (readonly) return;
    setIsHovering(false);
    setHoverValue(null);
  });

  const handleContainerPointerOut = useMemoizedFn(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (readonly) return;
      const nextTarget = e.relatedTarget as Node | null;
      const container = containerRef.current;
      if (!nextTarget || (container && !container.contains(nextTarget))) {
        setIsHovering(false);
        setHoverValue(null);
      }
    },
  );

  // 移除与全局相关的监听，避免外部状态干扰

  const handleContainerEnter = useMemoizedFn(() => {
    if (readonly) return;
    setIsHovering(true);
  });

  useEffect(() => {
    setHoverValue(null);
  }, [value]);

  const handleContainerClick = useMemoizedFn(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();
      if (readonly) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = clamp(x / rect.width, 0, 1);
      const raw = ratio * max;
      const normalized = quantizeByStep(raw);
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
      ref={containerRef}
      className={containerCls}
      onDoubleClick={stopDouble}
      onPointerEnter={handleContainerEnter}
      onPointerLeave={handleLeave}
      onPointerOut={handleContainerPointerOut}
      onPointerMove={handleContainerMove}
      onClick={handleContainerClick}
    >
      {Array.from({ length: max }).map((_, idx) => {
        const index = idx + 1;

        return (
          <IconComp
            key={idx}
            index={index}
            displayValue={displayValue}
            theme={theme}
            size={size}
          />
        );
      })}
    </div>
  );
};

export default Star;
