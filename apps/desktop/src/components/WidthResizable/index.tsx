import React, { useEffect, useState, PropsWithChildren } from "react";
import classnames from "classnames";

import styles from "./index.module.less";
import { useThrottleFn } from "ahooks";
import useThemeColors from "@/hooks/useThemeColors";

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
}

const WidthResizable: React.FC<PropsWithChildren<IWidthResizableProps>> = (
  props,
) => {
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
  } = props;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const themeColors = useThemeColors();
  const handleHighlightColor =
    themeColors.accentSoftBg || "rgba(170, 198, 255, 0.4)";

  const [width, setWidth] = useState<number>(() => {
    if (minWidth && defaultWidth < minWidth) return minWidth;
    if (maxWidth && defaultWidth > maxWidth) return maxWidth;
    return defaultWidth;
  });
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [showHandleHighlight, setShowHandleHighlight] =
    useState<boolean>(false);
  const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const resetHoverState = React.useCallback(() => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setShowHandleHighlight(false);
  }, []);

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
    { wait: 10 },
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
      className={classnames(styles.widthResizable, className)}
      style={{
        ...style,
        width,
        minWidth,
        maxWidth,
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
          className={classnames(styles.resizeBar, {
            [styles.left]: side === "left",
          })}
          style={
            handleOffset
              ? { [side === "left" ? "left" : "right"]: -handleOffset }
              : undefined
          }
        >
          <div
            className={classnames(
              "pointer-events-none h-full w-[4px] rounded-sm transition-colors duration-300 ease-in-out",
              side === "left" ? "mr-auto ml-0" : "ml-auto mr-0",
            )}
            style={{
              backgroundColor:
                showHandleHighlight || isResizing
                  ? handleHighlightColor
                  : "transparent",
            }}
          />
        </div>
      )}
    </div>
  );
};

export default WidthResizable;
