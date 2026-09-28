import { useDebounceFn } from "ahooks";
import { useEffect, useMemo } from "react";
import { TextBoxPadding, toCssPadding } from "../../../constants/text-style";

/** 空内容时的最小宽度 */
const EMPTY_MIN_WIDTH = 160;

interface UseHandleResizeProps {
  handleOnEditorSizeChange: (width: number, height: number) => void;
  maxWidth: number;
  maxHeight: number;
  padding: TextBoxPadding;
  /** 内容为空：给个最小盒子，否则 fit-content 缩成一个点 */
  isEmpty?: boolean;
  /** slate 编辑器 DOM：协作会话就绪前不存在，由调用方跟踪后传入 */
  editor: HTMLElement | null;
  focus: boolean;
  resized: boolean;
  isSelected: boolean;
  autoHeight?: boolean;
  width?: number;
}

const useHandleResize = ({
  handleOnEditorSizeChange,
  maxWidth,
  maxHeight,
  editor,
  resized,
  padding,
  isEmpty = false,
  focus,
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
        handleOnEditorSizeChange(width ?? Math.ceil(inlineSize), Math.ceil(blockSize));
      } else {
        // 默认模式：宽高受 maxWidth/maxHeight 限制
        handleOnEditorSizeChange(
          Math.min(maxWidth, Math.ceil(inlineSize)),
          Math.min(maxHeight, Math.ceil(blockSize))
        );
      }
    },
    { wait: 40 }
  );

  useEffect(() => {
    // autoHeight 模式始终监听高度变化
    if (!editor || (resized && !autoHeight)) return;

    const observer = new ResizeObserver(handleResize);
    observer.observe(editor);

    return () => {
      observer.disconnect();
    };
  }, [editor, handleResize, resized, autoHeight]);

  const editorStyle = useMemo(() => {
    if (autoHeight) {
      // autoHeight 模式：宽度固定，高度自适应
      return {
        width: width ?? "100%",
        height: "auto",
        overflow: "visible",
        boxSizing: "border-box",
        padding: toCssPadding(padding),
        cursor: isSelected ? "move" : "auto",
      } as React.CSSProperties;
    }

    // 默认模式
    return {
      minWidth: !resized && isEmpty ? Math.min(EMPTY_MIN_WIDTH, maxWidth) : undefined,
      width: resized ? maxWidth : "fit-content",
      height: resized ? maxHeight : "auto",
      overflow: "auto",
      boxSizing: "border-box",
      padding: toCssPadding(padding),
      maxWidth,
      maxHeight,
      cursor: isSelected ? "move" : "auto",
    } as React.CSSProperties;
  }, [maxWidth, maxHeight, resized, padding, isEmpty, isSelected, autoHeight, width]);

  return {
    handleResize,
    editorStyle,
  };
};

export default useHandleResize;
