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
}: UseHandleResizeProps) => {
  const { run: handleResize } = useDebounceFn(
    (entries: ResizeObserverEntry[]) => {
      if (!focus) return;
      const entry = entries[0];
      const { blockSize, inlineSize } = entry.borderBoxSize[0];
      handleOnEditorSizeChange(
        Math.min(maxWidth, Math.ceil(inlineSize)),
        Math.min(maxHeight, Math.ceil(blockSize)),
      );
    },
    { wait: 40 },
  );

  useEffect(() => {
    if (!container || resized) return;

    const observer = new ResizeObserver(handleResize);
    const editor = container.querySelector(":scope > [data-slate-editor]");
    if (!editor) return;

    observer.observe(editor);

    return () => {
      observer.disconnect();
    };
  }, [container, handleResize, resized]);

  const editorStyle = useMemo(() => {
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
  ]);

  return {
    handleResize,
    editorStyle,
  };
};

export default useHandleResize;
