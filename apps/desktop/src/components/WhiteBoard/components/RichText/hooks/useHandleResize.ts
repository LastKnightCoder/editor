import { useDebounceFn } from "ahooks";
import { useEffect, useMemo } from "react";

interface UseHandleResizeProps {
  handleOnEditorSizeChange: (width: number, height: number) => void;
  maxWidth: number;
  maxHeight: number;
  paddingWidth: number;
  paddingHeight: number;
  container: HTMLDivElement | null;
  focus: boolean;
  resized: boolean;
  isMoving: boolean;
  isSelected: boolean;
  autoHeight?: boolean;
  width?: number;
}

const useHandleResize = ({
  handleOnEditorSizeChange,
  maxWidth,
  maxHeight,
  container,
  resized,
  paddingWidth,
  paddingHeight,
  focus,
  isMoving,
  isSelected,
  autoHeight = false,
  width,
}: UseHandleResizeProps) => {
  const { run: handleResize } = useDebounceFn(
    (entries: ResizeObserverEntry[]) => {
      // autoHeight 模式下始终响应高度变化，非 autoHeight 模式下只在聚焦时响应
      if (!autoHeight && !focus) return;
      const entry = entries[0];
      const { blockSize, inlineSize } = entry.borderBoxSize[0];

      if (autoHeight) {
        // autoHeight 模式：宽度固定，高度不受 maxHeight 限制
        handleOnEditorSizeChange(
          width ?? Math.ceil(inlineSize),
          Math.ceil(blockSize),
        );
      } else {
        // 默认模式：宽高受 maxWidth/maxHeight 限制
        handleOnEditorSizeChange(
          Math.min(maxWidth, Math.ceil(inlineSize)),
          Math.min(maxHeight, Math.ceil(blockSize)),
        );
      }
    },
    { wait: 40 },
  );

  useEffect(() => {
    // autoHeight 模式始终监听高度变化
    if (!container || (resized && !autoHeight)) return;

    const observer = new ResizeObserver(handleResize);
    const editor = container.querySelector(":scope > [data-slate-editor]");
    if (!editor) return;

    observer.observe(editor);

    return () => {
      observer.disconnect();
    };
  }, [container, handleResize, resized, autoHeight]);

  const editorStyle = useMemo(() => {
    if (autoHeight) {
      // autoHeight 模式：宽度固定，高度自适应
      return {
        width: width ?? "100%",
        height: "auto",
        overflow: "visible",
        boxSizing: "border-box",
        padding: `${paddingHeight}px ${paddingWidth}px`,
        cursor: isSelected ? "move" : "auto",
        pointerEvents: isMoving ? "none" : "auto",
        userSelect: isMoving || isSelected ? "none" : "auto",
      } as React.CSSProperties;
    }

    // 默认模式
    return {
      width: resized ? maxWidth : "fit-content",
      height: resized ? maxHeight : "auto",
      overflow: "auto",
      boxSizing: "border-box",
      padding: `${paddingHeight}px ${paddingWidth}px`,
      maxWidth,
      maxHeight,
      cursor: isSelected ? "move" : "auto",
      pointerEvents: isMoving ? "none" : "auto",
      userSelect: isMoving || isSelected ? "none" : "auto",
    } as React.CSSProperties;
  }, [
    maxWidth,
    maxHeight,
    resized,
    paddingWidth,
    paddingHeight,
    isMoving,
    isSelected,
    autoHeight,
    width,
  ]);

  return {
    handleResize,
    editorStyle,
  };
};

export default useHandleResize;
