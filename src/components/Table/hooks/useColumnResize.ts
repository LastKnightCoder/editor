import { useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";

/**
 * 用于列调整大小的钩子
 */
export function useColumnResize(
  onResize: (columnId: string, width: number) => void,
) {
  const [resizing, setResizing] = useState<{
    columnId: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const startResize = useMemoizedFn(
    (columnId: string, startX: number, startWidth: number) => {
      setResizing({ columnId, startX, startWidth });
    },
  );

  const handleResize = useMemoizedFn((clientX: number) => {
    if (!resizing) return;

    const { columnId, startX, startWidth } = resizing;
    const delta = clientX - startX;
    const newWidth = Math.max(50, startWidth + delta);

    onResize(columnId, newWidth);
  });

  const stopResize = useMemoizedFn(() => {
    setResizing(null);
  });

  // 当调整大小时添加全局事件监听器
  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      handleResize(e.clientX);
    };

    const handleMouseUp = () => {
      stopResize();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing, handleResize, stopResize]);

  return {
    isResizing: !!resizing,
    startResize,
    handleResize,
    stopResize,
  };
}

export default useColumnResize;
