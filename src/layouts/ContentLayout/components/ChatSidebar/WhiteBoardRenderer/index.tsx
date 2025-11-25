import React, {
  useMemo,
  lazy,
  Suspense,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import { useDebounce, useLocalStorageState } from "ahooks";
import {
  CodeOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from "@ant-design/icons";
import LazySyntaxHighlighter from "../LazySyntaxHighlighter";
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

  const [showSource, setShowSource] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const whiteBoardRef = useRef<WhiteBoardRef>(null);
  const fullscreenWhiteBoardRef = useRef<WhiteBoardRef>(null);

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

  // 全屏时自动居中
  useEffect(() => {
    if (isFullscreen && data.length > 0) {
      const timer = setTimeout(() => {
        fullscreenWhiteBoardRef.current?.fitAllElements(50, true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isFullscreen, data.length]);

  // 全屏模态框
  const fullscreenModal =
    isFullscreen &&
    createPortal(
      <div
        className={styles.fullscreenOverlay}
        onClick={() => setIsFullscreen(false)}
      >
        <div
          className={styles.fullscreenContent}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className={styles.fullscreenClose}
            onClick={() => setIsFullscreen(false)}
            title="退出全屏"
          >
            <FullscreenExitOutlined />
          </button>
          <Suspense
            fallback={
              <div className={styles.whiteBoardLoading}>加载白板组件...</div>
            }
          >
            <WhiteBoard
              ref={fullscreenWhiteBoardRef}
              key={`${boardKey}-fullscreen`}
              initData={data as any}
              readonly
            />
          </Suspense>
        </div>
      </div>,
      document.body,
    );

  return (
    <div className={styles.whiteBoardContainer}>
      <div className={styles.toolbarButtons}>
        <button
          className={styles.toolbarButton}
          onClick={() => setShowSource(!showSource)}
          title={showSource ? "隐藏源码" : "显示源码"}
        >
          <CodeOutlined />
        </button>
        <button
          className={styles.toolbarButton}
          onClick={() => setIsFullscreen(true)}
          title="全屏查看"
        >
          <FullscreenOutlined />
        </button>
      </div>

      {showSource && (
        <LazySyntaxHighlighter language="yaml">
          {debouncedCode}
        </LazySyntaxHighlighter>
      )}

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

      {fullscreenModal}
    </div>
  );
};

export default React.memo(WhiteBoardRenderer);
