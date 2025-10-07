import React, { useState, useRef, useMemo, useEffect } from "react";
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
  const isHoveringRef = useRef<boolean>(false);
  const [isHovering, setIsHovering] = useState<boolean>(false);

  const displayValue = useMemo(() => {
    const displayValue = normalizeValue(
      isHovering ? (hoverValue ?? 0) : (value ?? 0),
      max,
      step,
    );
    return displayValue;
  }, [hoverValue, value, max, step, isHovering]);

  const handleContainerMove = useMemoizedFn((e: PointerEvent) => {
    if (readonly || !isHoveringRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = clamp(x / rect.width, 0, 1);
    const raw = ratio * max;
    setHoverValue(normalizeValue(raw, max, step));
  });

  const handleLeave = useMemoizedFn(() => {
    isHoveringRef.current = false;
    setIsHovering(false);
    if (readonly) return;
    setHoverValue(null);
  });

  const handleContainerEnter = useMemoizedFn(() => {
    setIsHovering(true);
    isHoveringRef.current = true;
  });

  const handleContainerClick = useMemoizedFn((e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (readonly) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = clamp(x / rect.width, 0, 1);
    const raw = ratio * max;
    const current = normalizeValue(raw ?? 0, max, step);
    onChange?.(current);
  });

  const handlePointerOut = useMemoizedFn((e: PointerEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const to = (e.relatedTarget as Node | null) ?? null;
    if (!to || !container.contains(to)) {
      handleLeave();
    }
  });

  const handlePointerCancel = useMemoizedFn(() => {
    handleLeave();
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("pointerenter", handleContainerEnter);
    container.addEventListener("pointerleave", handleLeave);
    container.addEventListener("pointermove", handleContainerMove);
    container.addEventListener("pointerout", handlePointerOut);
    container.addEventListener("pointercancel", handlePointerCancel);
    container.addEventListener("click", handleContainerClick);
    return () => {
      container.removeEventListener("pointerenter", handleContainerEnter);
      container.removeEventListener("pointerleave", handleLeave);
      container.removeEventListener("pointermove", handleContainerMove);
      container.removeEventListener("pointerout", handlePointerOut);
      container.removeEventListener("pointercancel", handlePointerCancel);
      container.removeEventListener("click", handleContainerClick);
    };
  }, []);

  // 窗口级兜底：指针在容器外移动、窗口失焦、页面隐藏或鼠标离开文档时，强制触发离开
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onGlobalPointerMove = (e: PointerEvent) => {
      if (readonly) return;
      if (!isHoveringRef.current) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;
      const threshold = 10;
      const inside =
        x >= rect.left - threshold &&
        x <= rect.right + threshold &&
        y >= rect.top - threshold &&
        y <= rect.bottom + threshold;
      if (!inside && isHoveringRef.current) {
        handleLeave();
      }
    };

    const onDocumentPointerOut = (e: PointerEvent) => {
      const to = (e.relatedTarget as Node | null) ?? null;
      if (!to && isHoveringRef.current) {
        handleLeave();
      }
    };

    const onWindowBlur = () => {
      handleLeave();
    };

    const onVisibilityChange = () => {
      if (document.hidden) handleLeave();
    };

    window.addEventListener("pointermove", onGlobalPointerMove);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("pointerout", onDocumentPointerOut);

    return () => {
      window.removeEventListener("pointermove", onGlobalPointerMove);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("pointerout", onDocumentPointerOut);
    };
  }, []);

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
    <div ref={containerRef} className={containerCls} onDoubleClick={stopDouble}>
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
