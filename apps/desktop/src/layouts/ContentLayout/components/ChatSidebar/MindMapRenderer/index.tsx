import React, { useMemo, lazy, Suspense, useCallback, forwardRef } from "react";
import { useDebounce, useLocalStorageState } from "ahooks";
import { parseMindMapList } from "./parseMindMapList";
import { MindMapRef } from "@/components/MindMap";
import styles from "./index.module.less";

const MindMap = lazy(() => import("@/components/MindMap"));

const DEFAULT_HEIGHT = 400;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 800;

// 生成简单的哈希值作为唯一标识
const hashCode = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

interface MindMapRendererProps {
  code: string;
}

const MindMapRenderer = forwardRef<MindMapRef, MindMapRendererProps>(
  ({ code }, ref) => {
    // 500ms 节流，防止流式输出时频繁渲染
    const debouncedCode = useDebounce(code, { wait: 500 });

    // 基于代码内容生成唯一的存储 key
    const storageKey = useMemo(
      () => `mindmap-height-${hashCode(debouncedCode)}`,
      [debouncedCode],
    );

    // 高度持久化（每个思维导图独立）
    const [height, setHeight] = useLocalStorageState<number>(storageKey, {
      defaultValue: DEFAULT_HEIGHT,
    });

    // 拖拽调整高度
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

    // 解析 Markdown 列表为 MindMapNodeData
    const { data, error } = useMemo(() => {
      if (!debouncedCode.trim()) {
        return { data: null, error: null };
      }

      try {
        const parsedData = parseMindMapList(debouncedCode);
        return { data: parsedData, error: null };
      } catch (err) {
        return {
          data: null,
          error: err instanceof Error ? err.message : "解析失败",
        };
      }
    }, [debouncedCode]);

    return (
      <div className={styles.mindMapContainer}>
        {/* 渲染思维导图或错误信息 */}
        {error ? (
          <div className={styles.mindMapError}>
            <p>思维导图渲染错误：</p>
            <pre>{error}</pre>
          </div>
        ) : data ? (
          <Suspense
            fallback={
              <div className={styles.mindMapLoading}>加载思维导图组件...</div>
            }
          >
            <div
              className={styles.mindMapWrapper}
              style={{ height: height ?? DEFAULT_HEIGHT }}
            >
              <MindMap ref={ref} data={data} />
            </div>
            {/* 拖拽调整高度的手柄 */}
            <div
              className={styles.resizeHandle}
              onMouseDown={handleResizeStart}
            />
          </Suspense>
        ) : (
          <div className={styles.mindMapLoading}>等待数据解析...</div>
        )}
      </div>
    );
  },
);

MindMapRenderer.displayName = "MindMapRenderer";

export default React.memo(MindMapRenderer);
