import React, { memo } from "react";
import { cn } from "@tau/ui";

interface IColumnResizerProps {
  isResizing: boolean;
  onResizeStart: (e: React.PointerEvent) => void;
  onMouseResizeStart?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

const ColumnResizer: React.FC<IColumnResizerProps> = memo(
  ({ isResizing, onResizeStart, onMouseResizeStart, style }) => {
    return (
      <div
        contentEditable={false}
        className={cn(
          "pointer-events-auto absolute bottom-0 top-0 z-30 w-[10px] -translate-x-1/2 cursor-col-resize touch-none select-none",
          "before:absolute before:bottom-[0.5em] before:left-1/2 before:top-[0.5em] before:w-[2px] before:-translate-x-1/2 before:bg-[var(--ed-border)] before:transition-[background-color,width] before:duration-200 before:content-['']",
          "hover:before:w-[4px] hover:before:bg-[var(--ed-accent-text)]",
          isResizing && "before:w-[4px] before:bg-[var(--ed-accent-text)]"
        )}
        style={style}
        onPointerDown={onResizeStart}
        onMouseDown={onMouseResizeStart}
      />
    );
  }
);

ColumnResizer.displayName = "ColumnResizer";

export default ColumnResizer;
