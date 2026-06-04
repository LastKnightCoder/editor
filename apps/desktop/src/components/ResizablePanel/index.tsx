import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";

interface ResizablePanelProps {
  id?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  leftPanel?: React.ReactNode;
  rightPanel?: React.ReactNode;
  className?: string;
  leftClassName?: string;
  rightClassName?: string;
  initialLeftRatio?: number;
  defaultLeftWidth?: number;
  minLeft?: number;
  minRight?: number;
  minLeftWidth?: number;
  maxLeftWidth?: number;
  handleClassName?: string;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
const MIN_RATIO = 0.05;
const MAX_RATIO = 0.95;

const ResizablePanel = ({
  id,
  left,
  right,
  leftPanel,
  rightPanel,
  className,
  leftClassName,
  rightClassName,
  initialLeftRatio = 0.5,
  defaultLeftWidth,
  minLeft = 320,
  minRight = 360,
  minLeftWidth,
  maxLeftWidth,
  handleClassName,
}: ResizablePanelProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const storageKey = useMemo(() => (id ? `resizable-panel-${id}` : null), [id]);
  const percentToRatio = (value?: number) => {
    if (value == null || Number.isNaN(value)) return undefined;
    return clamp(value / 100, MIN_RATIO, MAX_RATIO);
  };
  const defaultRatio =
    percentToRatio(defaultLeftWidth) ??
    clamp(initialLeftRatio, MIN_RATIO, MAX_RATIO);
  const minRatioPercent = percentToRatio(minLeftWidth);
  const maxRatioPercent = percentToRatio(maxLeftWidth);

  const getBounds = useCallback(() => {
    const container = containerRef.current;
    const width = container?.getBoundingClientRect().width || 1;
    const rawMin = minRatioPercent ?? Math.min(minLeft / width, 1 - MIN_RATIO);
    const rawMax = maxRatioPercent ?? Math.max(1 - minRight / width, MIN_RATIO);
    const tentativeMin = Math.min(rawMin, rawMax - MIN_RATIO);
    const tentativeMax = Math.max(rawMax, tentativeMin + MIN_RATIO);
    const safeMin = clamp(tentativeMin, MIN_RATIO, MAX_RATIO);
    const safeMax = clamp(tentativeMax, MIN_RATIO, MAX_RATIO);
    return { min: Math.min(safeMin, safeMax), max: Math.max(safeMin, safeMax) };
  }, [minLeft, minRight, minRatioPercent, maxRatioPercent]);

  const [leftRatio, setLeftRatio] = useState(() => {
    if (typeof window === "undefined") return defaultRatio;
    if (storageKey) {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved > 0 && saved < 1) {
        return saved;
      }
    }
    return defaultRatio;
  });
  const [isDragging, setIsDragging] = useState(false);

  const persistRatio = useCallback(
    (ratio: number) => {
      if (typeof window === "undefined" || !storageKey) return;
      localStorage.setItem(storageKey, ratio.toString());
    },
    [storageKey],
  );

  const updateRatioFromClientX = useCallback(
    (clientX: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const width = rect.width || 1;
      const rawRatio = (clientX - rect.left) / width;
      const { min, max } = getBounds();
      const nextRatio = clamp(rawRatio, min, max);
      setLeftRatio(nextRatio);
      persistRatio(nextRatio);
    },
    [getBounds, persistRatio],
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      draggingRef.current = true;
      setIsDragging(true);
      updateRatioFromClientX(event.clientX);
    },
    [updateRatioFromClientX],
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!draggingRef.current) return;
      updateRatioFromClientX(event.clientX);
    };
    const handleMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setIsDragging(false);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [updateRatioFromClientX]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      const { min, max } = getBounds();
      setLeftRatio((current) => clamp(current, min, max));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [getBounds]);

  const leftContent = left ?? leftPanel;
  const rightContent = right ?? rightPanel;

  // 如果右侧面板为空，只渲染左侧面板
  if (rightContent == null) {
    return (
      <div
        ref={containerRef}
        className={classNames("flex h-full w-full overflow-hidden", className)}
      >
        <div className={classNames("h-full w-full", leftClassName)}>
          {leftContent}
        </div>
      </div>
    );
  }

  if (leftContent == null) {
    console.warn("[ResizablePanel] Missing left content for panel:", id);
    return null;
  }

  const leftStyle = { flexBasis: `${leftRatio * 100}%` };
  const rightStyle = { flexBasis: `${(1 - leftRatio) * 100}%` };

  return (
    <div
      ref={containerRef}
      className={classNames(
        "flex h-full w-full overflow-hidden",
        isDragging && "select-none",
        className,
      )}
    >
      <div
        className={classNames(
          "h-full min-w-0",
          isDragging && "pointer-events-none",
          leftClassName,
        )}
        style={leftStyle}
      >
        {leftContent}
      </div>
      <div
        className={classNames(
          "flex h-full w-[6px] shrink-0 cursor-col-resize items-center justify-center",
          handleClassName,
        )}
        onMouseDown={handleMouseDown}
      >
        <div className="h-full w-[2px] rounded-full bg-gray-200 dark:bg-zinc-700" />
      </div>
      <div
        className={classNames(
          "h-full min-w-0",
          isDragging && "pointer-events-none",
          rightClassName,
        )}
        style={rightStyle}
      >
        {rightContent}
      </div>
    </div>
  );
};

export default ResizablePanel;
