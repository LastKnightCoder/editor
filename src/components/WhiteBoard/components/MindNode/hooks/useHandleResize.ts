import { useDebounceFn } from "ahooks";
import { useEffect } from "react";

interface UseHandleResizeProps {
  handleOnEditorSizeChange: (width: number, height: number) => void;
  maxWidth: number;
  container: HTMLDivElement | null;
}

const useHandleResize = ({ handleOnEditorSizeChange, maxWidth, container }: UseHandleResizeProps) => {
  const { run: handleResize } = useDebounceFn((entries: ResizeObserverEntry[]) => {
    const entry = entries[0];
    const { blockSize, inlineSize } = entry.borderBoxSize[0];
    handleOnEditorSizeChange(Math.min(maxWidth, inlineSize + 1), blockSize);
  }, { wait: 40 });

  useEffect(() => {
    if (!container) return;

    const observer = new ResizeObserver(handleResize);
    const editor = container.querySelector(':scope > [data-slate-editor]');
    if (!editor) return;

    observer.observe(editor);

    return () => {
      observer.disconnect();
    }
  }, [container, handleResize]);

  return {
    handleResize,
  }
}

export default useHandleResize;
