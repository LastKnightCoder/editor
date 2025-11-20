import { useDebounceFn } from "ahooks";
import { useEffect } from "react";

interface UseHandleResizeProps {
  handleOnEditorSizeChange: (width: number, height: number) => void;
  maxWidth: number;
  container: HTMLDivElement | null;
}

const useHandleResize = ({
  handleOnEditorSizeChange,
  maxWidth,
  container,
}: UseHandleResizeProps) => {
  const { run: handleResizeObserver } = useDebounceFn(
    (entries: ResizeObserverEntry[]) => {
      const entry = entries[0];
      const target = entry.target as HTMLElement;

      // 优先使用 borderBoxSize，如果无效则降级到 offsetWidth/Height
      let width = 0;
      let height = 0;

      const borderBoxSize = entry.borderBoxSize?.[0];
      if (
        borderBoxSize &&
        borderBoxSize.inlineSize > 0 &&
        borderBoxSize.blockSize > 0
      ) {
        width = borderBoxSize.inlineSize;
        height = borderBoxSize.blockSize;
      } else {
        width = target.offsetWidth;
        height = target.offsetHeight;
      }

      // 如果还是 0，尝试 getComputedStyle
      if (width === 0 || height === 0) {
        const style = window.getComputedStyle(target);
        width = parseFloat(style.width) || 0;
        height = parseFloat(style.height) || 0;
      }

      if (width === 0 || height === 0) return;

      width = Math.max(40, Math.min(maxWidth, width + 1));
      height = Math.max(56, height);

      handleOnEditorSizeChange(width, height);
    },
    { wait: 40 },
  );

  useEffect(() => {
    if (!container) return;

    let currentEditor: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const setupResizeObserver = (element: HTMLElement) => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      resizeObserver = new ResizeObserver(handleResizeObserver);
      resizeObserver.observe(element);

      // 立即测量一次
      const style = window.getComputedStyle(element);
      const width = parseFloat(style.width) || element.offsetWidth;
      const height = parseFloat(style.height) || element.offsetHeight;
      if (width > 0 && height > 0) {
        const finalWidth = Math.max(24, Math.min(maxWidth, width));
        const finalHeight = Math.max(32, height);
        handleOnEditorSizeChange(finalWidth, finalHeight);
      }
    };

    const checkAndAttachEditor = () => {
      const editor = container.querySelector(
        "[data-slate-editor]",
      ) as HTMLElement;

      // 关键验证：如果找到了新元素，且与当前元素不同，说明 DOM 被替换了
      if (editor && editor !== currentEditor) {
        currentEditor = editor;
        setupResizeObserver(editor);
      }
    };

    // 初始检查
    checkAndAttachEditor();

    // 监听 DOM 变化
    const mutationObserver = new MutationObserver(() => {
      checkAndAttachEditor();
    });

    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
    });

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [container, handleResizeObserver, maxWidth, handleOnEditorSizeChange]);

  return {
    handleResize: useDebounceFn(
      () => {
        if (!container) return;
        const editor = container.querySelector(
          "[data-slate-editor]",
        ) as HTMLElement;
        if (!editor) return;

        handleOnEditorSizeChange(
          Math.max(24, Math.min(maxWidth, editor.offsetWidth)),
          Math.max(32, editor.offsetHeight),
        );
      },
      { wait: 40 },
    ),
  };
};

export default useHandleResize;
