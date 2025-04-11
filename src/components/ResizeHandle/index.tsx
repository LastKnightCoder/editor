import React, { useRef } from "react";
import styles from "./index.module.less";
import { useMemoizedFn } from "ahooks";

interface ResizeHandleProps {
  initialHeight: number;
  onHeightChange: (height: number) => void;
  minHeight?: number;
  maxHeight?: number;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({
  initialHeight,
  onHeightChange,
  minHeight = 200,
  maxHeight = 800,
  onResizeStart,
  onResizeEnd,
}) => {
  const resizeStartYRef = useRef(0);
  const startHeightRef = useRef(initialHeight);

  const handleResizeStart = useMemoizedFn((e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartYRef.current = e.clientY;
    startHeightRef.current = initialHeight;
    onResizeStart?.();
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  });

  const handleResizeMove = useMemoizedFn((e: MouseEvent) => {
    const deltaY = e.clientY - resizeStartYRef.current;
    const newHeight = Math.max(
      minHeight,
      Math.min(maxHeight, startHeightRef.current + deltaY),
    );
    onHeightChange(newHeight);
  });

  const handleResizeEnd = useMemoizedFn(() => {
    onResizeEnd?.();
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
  });

  return (
    <div className={styles.resizeHandle} onMouseDown={handleResizeStart}>
      <div className={styles.resizeIndicator} />
    </div>
  );
};

export default ResizeHandle;
