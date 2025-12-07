import { useRef, useEffect } from "react";
import useTheme from "../../../../hooks/useTheme";
import { compileAndExecuteCustomBlock } from "../../utils/renderTemplate";
import { useSlateStatic } from "slate-react";

interface TemplatePreviewProps {
  content: string;
}

const TemplatePreview = ({ content }: TemplatePreviewProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const { isDark } = useTheme();
  const editor = useSlateStatic();
  const compilerService = editor.services?.compiler;
  useEffect(() => {
    if (!ref.current || !content) return;

    let cleanup: (() => void) | undefined;
    let disposed = false;
    const abortController = new AbortController();

    compileAndExecuteCustomBlock(
      content,
      isDark,
      ref.current,
      { useTheme },
      {
        tailwindRuntime: compilerService?.tailwindRuntime,
      },
      abortController.signal,
    )
      .then((cleanupFn) => {
        if (!cleanupFn) return;
        if (disposed) {
          cleanupFn();
          return;
        }
        cleanup = cleanupFn;
      })
      .catch((error) => {
        console.error("Template preview error:", error);
        if (ref.current) {
          ref.current.innerHTML = `<div class="flex items-center justify-center h-full text-xs text-gray-400 p-2">预览加载失败</div>`;
        }
      });

    return () => {
      disposed = true;
      abortController.abort();
      cleanup?.();
      cleanup = undefined;
    };
  }, [content, isDark, compilerService]);

  return (
    <div
      ref={ref}
      className="w-full h-full p-2 overflow-hidden"
      style={{
        transform: "scale(0.8)",
        transformOrigin: "top left",
      }}
    ></div>
  );
};

export default TemplatePreview;
