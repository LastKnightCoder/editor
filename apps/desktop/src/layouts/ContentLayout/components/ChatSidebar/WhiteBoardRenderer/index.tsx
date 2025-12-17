import React, {
  useMemo,
  lazy,
  Suspense,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { useDebounce, useLocalStorageState } from "ahooks";
import { useMarkdownContext } from "../MarkdownContext";
import { parseWhiteBoard } from "./parseWhiteBoard";
import type { WhiteBoardRef } from "@/components/WhiteBoard";
import styles from "./index.module.less";

const WhiteBoard = lazy(() => import("@/components/WhiteBoard"));

const DEFAULT_HEIGHT = 400;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 800;

const hashCode = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

interface WhiteBoardRendererProps {
  code: string;
}

const WhiteBoardRenderer: React.FC<WhiteBoardRendererProps> = ({ code }) => {
  const { isDark } = useMarkdownContext();
  const debouncedCode = useDebounce(code, { wait: 500 });

  const storageKey = useMemo(
    () => `whiteboard-height-${hashCode(debouncedCode)}`,
    [debouncedCode],
  );

  const whiteBoardRef = useRef<WhiteBoardRef>(null);

  const [height, setHeight] = useLocalStorageState<number>(storageKey, {
    defaultValue: DEFAULT_HEIGHT,
  });

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = height ?? DEFAULT_HEIGHT;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = moveEvent.clientY - startY;
        const newHeight = Math.min(
          MAX_HEIGHT,
          Math.max(MIN_HEIGHT, startHeight + deltaY),
        );
        setHeight(newHeight);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [height, setHeight],
  );

  // 使用 debouncedCode 的 hash 作为 key，数据变化时强制重新渲染 WhiteBoard
  const boardKey = useMemo(
    () => hashCode(debouncedCode + (isDark ? "-dark" : "-light")),
    [debouncedCode, isDark],
  );

  const { data, error } = useMemo(() => {
    if (!debouncedCode.trim()) {
      return { data: [] as any[], error: null as string | null };
    }
    try {
      const parsed = parseWhiteBoard(debouncedCode, isDark);
      return { data: parsed, error: null };
    } catch (err) {
      return {
        data: [],
        error: err instanceof Error ? err.message : "解析失败",
      };
    }
  }, [debouncedCode, isDark]);

  // 数据变化或首次渲染时自动居中所有元素
  useEffect(() => {
    if (data.length > 0) {
      // 延迟执行以确保 WhiteBoard 已完成渲染
      const timer = setTimeout(() => {
        whiteBoardRef.current?.fitAllElements(50, false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [boardKey, data.length]);

  return (
    <div className={styles.whiteBoardContainer}>
      {error ? (
        <div className={styles.whiteBoardError}>
          <p>白板渲染错误：</p>
          <pre>{error}</pre>
        </div>
      ) : (
        <Suspense
          fallback={
            <div className={styles.whiteBoardLoading}>加载白板组件...</div>
          }
        >
          <div
            className={styles.whiteBoardWrapper}
            style={{ height: height ?? DEFAULT_HEIGHT }}
          >
            <WhiteBoard
              ref={whiteBoardRef}
              key={boardKey}
              initData={data as any}
              readonly
            />
          </div>
          <div
            className={styles.resizeHandle}
            onMouseDown={handleResizeStart}
          />
        </Suspense>
      )}
    </div>
  );
};

export default React.memo(WhiteBoardRenderer);
