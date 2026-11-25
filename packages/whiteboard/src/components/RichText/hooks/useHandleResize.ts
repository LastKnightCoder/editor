import { useDebounceFn, useMemoizedFn } from "ahooks";
import { useLayoutEffect, useMemo } from "react";
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
  isSelected,
  autoHeight = false,
  width,
}: UseHandleResizeProps) => {
  const measure = useMemoizedFn(() => {
    if (!editor?.isConnected || !editor.getClientRects().length || (resized && !autoHeight)) return;
    const style = window.getComputedStyle(editor);
    const inlineSize = parseFloat(style.width) || editor.offsetWidth;
    const blockSize = parseFloat(style.height) || editor.offsetHeight;
    if (inlineSize <= 0 || blockSize <= 0) return;
    handleOnEditorSizeChange(
      autoHeight ? (width ?? Math.ceil(inlineSize)) : Math.min(maxWidth, Math.ceil(inlineSize)),
      autoHeight ? Math.ceil(blockSize) : Math.min(maxHeight, Math.ceil(blockSize))
    );
  });
  const handleResize = useDebounceFn(measure, { wait: 40 });
  const { run, cancel } = handleResize;

  useLayoutEffect(() => {
    if (!editor || (resized && !autoHeight)) return;
    measure();
    const observer = new ResizeObserver(run);
    observer.observe(editor);
    return () => {
      cancel();
      observer.disconnect();
    };
  }, [editor, measure, run, cancel, resized, autoHeight, maxWidth, maxHeight, width]);

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
