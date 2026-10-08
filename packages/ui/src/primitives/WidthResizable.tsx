import React, { useCallback, useEffect, useRef, useState, PropsWithChildren } from "react";

import { cn } from "../cn";
import { useThrottleFn } from "ahooks";

interface IWidthResizableProps {
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  onResize?: (width: number) => void;
  className?: string;
  /**
   * 拖拽条所在的边。
   * 这是 handle 的位置语义，不是整个侧边栏停靠的位置。
   * - `right`: 拖拽条在组件右边
   * - `left`: 拖拽条在组件左边
   */
  side?: "left" | "right";
  style?: React.CSSProperties;
  disableResize?: boolean;
  handleOffset?: number; // 拖拽条偏移量（像素），正值向外偏移
  /** 常驻 1px 淡分隔线标出可拖拽边界；hover / 拖拽时加粗为 2px 强调色 */
  showDivider?: boolean;
  /** 以 flex 铺满父级剩余空间，忽略宽度上下限（配合外层 flex 容器使用） */
  fillRemaining?: boolean;
}

const WidthResizable: React.FC<PropsWithChildren<IWidthResizableProps>> = props => {
  const {
    defaultWidth,
    minWidth,
    maxWidth,
    onResize,
    className,
    side = "right",
    style = {},
    disableResize = false,
    handleOffset = 0,
    showDivider = false,
    fillRemaining = false,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);

  const [width, setWidth] = useState<number>(() => {
    if (minWidth && defaultWidth < minWidth) return minWidth;
    if (maxWidth && defaultWidth > maxWidth) return maxWidth;
    return defaultWidth;
  });
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [showHandleHighlight, setShowHandleHighlight] = useState<boolean>(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetHoverState = useCallback(() => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setShowHandleHighlight(false);
  }, []);

  useEffect(() => {
    let nextWidth = defaultWidth;
    if (minWidth && nextWidth < minWidth) nextWidth = minWidth;
    if (maxWidth && nextWidth > maxWidth) nextWidth = maxWidth;
    setWidth(nextWidth);
  }, [defaultWidth, maxWidth, minWidth]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (disableResize) return;
    setIsResizing(true);
    e.stopPropagation();
    e.preventDefault();
  };

  const { run: handleMouseMove } = useThrottleFn(
    (e: MouseEvent) => {
      if (disableResize) return;
      if (isResizing) {
        const container = containerRef.current;
        if (!container) return;
        let newWidth = e.clientX - container.getBoundingClientRect().left;
        if (side === "left") {
          newWidth = container.offsetWidth - newWidth;
        }
        if (minWidth && newWidth < minWidth) {
          newWidth = minWidth;
        }
        if (maxWidth && newWidth > maxWidth) {
          newWidth = maxWidth;
        }
        setWidth(newWidth);
        if (onResize) onResize(newWidth);
      }
    },
    { wait: 10 }
  );

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  const handleHoverStart = () => {
    if (disableResize || hoverTimerRef.current) return;
    hoverTimerRef.current = setTimeout(() => {
      setShowHandleHighlight(true);
      hoverTimerRef.current = null;
    }, 200);
  };

  const handleHoverEnd = () => {
    if (disableResize) return;
    resetHoverState();
  };

  useEffect(() => {
    if (disableResize) return;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, disableResize]);

  useEffect(() => {
    if (disableResize) {
      resetHoverState();
    }
  }, [disableResize, resetHoverState]);

  useEffect(() => {
    return () => {
      resetHoverState();
    };
  }, [resetHoverState]);

  return (
    <div
      className={cn("relative", fillRemaining && "w-full min-w-0", className)}
      style={{
        ...style,
        ...(fillRemaining ? {} : { width, minWidth, maxWidth }),
      }}
      ref={containerRef}
    >
      {props.children}
      {!disableResize && (
        <div
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseEnter={handleHoverStart}
          onMouseLeave={handleHoverEnd}
          className={cn(
            "absolute top-0 z-10 h-full w-[10px] cursor-col-resize",
            side === "left" ? "left-0" : "right-0"
          )}
          style={handleOffset ? { [side === "left" ? "left" : "right"]: -handleOffset } : undefined}
        >
          {showDivider ? (
            <div
              className={cn(
                "pointer-events-none h-full transition-[background-color,width] duration-200 ease-in-out",
                side === "left" ? "ml-0 mr-auto" : "ml-auto mr-0",
                showHandleHighlight || isResizing ? "bg-accent w-[2px]" : "bg-line-1 w-px"
              )}
            />
          ) : (
            <div
              className={cn(
                "pointer-events-none h-full w-[4px] rounded-sm transition-colors duration-300 ease-in-out",
                side === "left" ? "ml-0 mr-auto" : "ml-auto mr-0"
              )}
              style={{
                backgroundColor:
                  showHandleHighlight || isResizing ? "var(--tau-accent-soft)" : "transparent",
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default WidthResizable;
