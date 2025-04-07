import React, { useEffect, useState, PropsWithChildren } from "react";
import classnames from "classnames";

import styles from "./index.module.less";
import { useThrottleFn } from "ahooks";

interface IWidthResizableProps {
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  onResize?: (width: number) => void;
  className?: string;
  side?: "left" | "right";
  style?: React.CSSProperties;
  disableResize?: boolean;
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
  } = props;
  const containerRef = React.useRef<HTMLDivElement>(null);

  const [width, setWidth] = useState<number>(() => {
    if (minWidth && defaultWidth < minWidth) return minWidth;
    if (maxWidth && defaultWidth > maxWidth) return maxWidth;
    return defaultWidth;
  });
  const [isResizing, setIsResizing] = useState<boolean>(false);

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

  useEffect(() => {
    if (disableResize) return;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, disableResize]);

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
          className={classnames(styles.resizeBar, {
            [styles.left]: side === "left",
          })}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
        />
      )}
    </div>
  );
};

export default WidthResizable;
