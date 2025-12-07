import { useMemoizedFn } from "ahooks";
import { useRef, useState } from "react";

export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface Size {
  width?: number;
  height?: number;
  left?: number;
  top?: number;
}

interface UseImageResizeOptions {
  initialSize: Size;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  aspectRatio?: number;
  onResizeEnd?: (size: Size) => void;
  onSizeChange?: (size: Size) => void;
  readonly?: boolean;
  keepAspectRatio?: boolean;
}

export function useImageResize({
  initialSize,
  minWidth = 50,
  maxWidth = Infinity,
  minHeight = 50,
  maxHeight = Infinity,
  aspectRatio,
  onResizeEnd,
  onSizeChange,
  readonly = false,
  keepAspectRatio = true,
}: UseImageResizeOptions) {
  const [size, setSize] = useState<Size>(initialSize);
  const [isResizing, setIsResizing] = useState(false);
  const sizeRef = useRef<Size>(initialSize);

  const handleResizeStart = useMemoizedFn(
    (e: React.PointerEvent, direction: ResizeDirection) => {
      if (readonly) return;

      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);

      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = size.width || 100;
      const startHeight = size.height || 100;
      const ratio = aspectRatio || startWidth / startHeight;

      // 捕获指针以确保即使离开元素也能获取事件
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        moveEvent.preventDefault();
        moveEvent.stopPropagation();

        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;
        let newWidth = startWidth;
        let newHeight = startHeight;

        // 根据方向计算新的尺寸
        if (direction.includes("e")) {
          newWidth = startWidth + deltaX;
        } else if (direction.includes("w")) {
          newWidth = startWidth - deltaX;
        }

        if (direction.includes("s")) {
          newHeight = startHeight + deltaY;
        } else if (direction.includes("n")) {
          newHeight = startHeight - deltaY;
        }

        // 限制最小宽度和最大宽度
        newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
        newHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));

        // 如果需要保持宽高比
        if (keepAspectRatio) {
          if (direction.includes("e") || direction.includes("w")) {
            // 如果调整的是宽度，根据宽度计算高度
            newHeight = newWidth / ratio;
          } else if (direction.includes("n") || direction.includes("s")) {
            // 如果调整的是高度，根据高度计算宽度
            newWidth = newHeight * ratio;
          }
        }

        setSize({
          width: newWidth,
          height: newHeight,
        });
        sizeRef.current = {
          width: newWidth,
          height: newHeight,
        };

        if (onSizeChange) {
          onSizeChange({
            width: newWidth,
            height: newHeight,
          });
        }
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        upEvent.preventDefault();
        upEvent.stopPropagation();
        setIsResizing(false);

        // 释放指针捕获
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);

        // 调用调整结束回调
        if (onResizeEnd && sizeRef.current.width && sizeRef.current.height) {
          onResizeEnd(sizeRef.current);
        }

        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
  );

  return {
    size,
    setSize,
    isResizing,
    handleResizeStart,
  };
}
