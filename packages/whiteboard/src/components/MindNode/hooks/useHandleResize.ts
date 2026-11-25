import { useDebounceFn, useMemoizedFn } from "ahooks";
import { useLayoutEffect, useRef, type RefObject } from "react";

interface UseHandleResizeProps {
  handleOnEditorSizeChange: (width: number, height: number) => void;
  maxWidth: number;
  containerRef: RefObject<HTMLDivElement | null>;
}

const useHandleResize = ({
  handleOnEditorSizeChange,
  maxWidth,
  containerRef,
}: UseHandleResizeProps) => {
  const editorRef = useRef<HTMLElement | null>(null);
  const measure = useMemoizedFn(() => {
    const editor = editorRef.current;
    if (!editor?.isConnected || !editor.getClientRects().length) return;
    const style = window.getComputedStyle(editor);
    const width = parseFloat(style.width) || editor.offsetWidth;
    const height = parseFloat(style.height) || editor.offsetHeight;
    if (width <= 0 || height <= 0) return;
    handleOnEditorSizeChange(
      Math.max(40, Math.min(maxWidth, Math.ceil(width))),
      Math.max(56, Math.ceil(height))
    );
  });
  const handleResize = useDebounceFn(measure, { wait: 40 });
  const { run, cancel } = handleResize;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resizeObserver = new ResizeObserver(run);
    const syncEditor = () => {
      const editor = container.querySelector<HTMLElement>("[data-slate-editor]");
      if (editor === editorRef.current) return;
      cancel();
      resizeObserver.disconnect();
      editorRef.current = editor;
      if (!editor) return;
      // 首次挂载和编辑器替换都直接恢复尺寸，不依赖选中后的重渲染。
      measure();
      resizeObserver.observe(editor);
    };
    syncEditor();
    const mutationObserver = new MutationObserver(syncEditor);
    mutationObserver.observe(container, { childList: true, subtree: true });
    return () => {
      cancel();
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      editorRef.current = null;
    };
  }, [containerRef, measure, run, cancel, maxWidth]);

  return { handleResize };
};

export default useHandleResize;
