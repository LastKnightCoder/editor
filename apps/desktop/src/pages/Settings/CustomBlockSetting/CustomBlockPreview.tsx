import { CSSProperties, useEffect, useRef } from "react";
import { compileAndExecuteCustomBlock } from "@tau/editor/src";
import useTheme from "@/hooks/useTheme";
import { compileCustomBlockTailwind } from "@/services/tailwindRuntime";

interface CustomBlockPreviewProps {
  content: string;
  className?: string;
  style?: CSSProperties;
}

const CustomBlockPreview = ({
  content,
  className,
  style,
}: CustomBlockPreviewProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const { isDark } = useTheme();

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
        tailwindRuntime: compileCustomBlockTailwind,
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
        console.error("Custom block preview error", error);
      });

    return () => {
      disposed = true;
      abortController.abort();
      cleanup?.();
      cleanup = undefined;
    };
  }, [content, isDark]);

  return <div ref={ref} className={className} style={style} />;
};

export default CustomBlockPreview;
