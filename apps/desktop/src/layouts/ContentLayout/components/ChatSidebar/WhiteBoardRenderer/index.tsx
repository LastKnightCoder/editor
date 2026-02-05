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
import {
  useWhiteBoardMeasurements,
  extractMeasurableElements,
} from "./useWhiteBoardMeasurements";
import WhiteBoardMeasureElement from "./WhiteBoardMeasureElement";
import type { WhiteBoardRef } from "@/components/WhiteBoard";
import type { BoardElement } from "@/components/WhiteBoard/types/board";
import styles from "./index.module.less";

const WhiteBoard = lazy(() => import("@/components/WhiteBoard"));

// 内部使用的扩展属性
interface InternalElementProps {
  _needsMeasure?: boolean;
  _rawText?: string;
  _childIds?: string[];
}

// 带内部属性的元素类型
type InternalBoardElement = BoardElement & InternalElementProps;

const DEFAULT_HEIGHT = 400;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 800;
const FRAME_PADDING = 20;
const HASH_VERSION = "v1";

const hashCode = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

// Frame 间距
const FRAME_GAP = 30;

/**
 * 检测两个矩形是否重叠
 */
const isOverlapping = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  gap = 0,
): boolean => {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
};

/**
 * 解决 Frame 重叠问题
 * 使用简单的推挤算法：按顺序放置，重叠时向右或向下移动
 * 同时使用深度优先遍历同步移动 Frame 内部的 children
 */
const resolveFrameOverlaps = (elements: BoardElement[]): BoardElement[] => {
  // 构建元素 Map，方便查找和修改
  const elementMap = new Map<string, InternalBoardElement>();
  elements.forEach((el) =>
    elementMap.set(el.id, { ...el } as InternalBoardElement),
  );

  // 收集所有 Frame
  const frames = elements
    .filter((el) => el.type === "frame")
    .map((el) => elementMap.get(el.id)!);

  if (frames.length <= 1) {
    return elements;
  }

  // 按位置排序（先 y 后 x）
  frames.sort((a, b) => {
    const ay = a.y ?? 0;
    const by = b.y ?? 0;
    if (Math.abs(ay - by) > 50) return ay - by;
    return (a.x ?? 0) - (b.x ?? 0);
  });

  // 记录每个 Frame 的偏移量
  const frameOffsets = new Map<string, { deltaX: number; deltaY: number }>();

  // 已放置的 Frame
  const placedFrames: InternalBoardElement[] = [];

  for (const frame of frames) {
    const originalX = frame.x ?? 0;
    const originalY = frame.y ?? 0;
    let currentX = originalX;
    let currentY = originalY;
    const width = frame.width ?? 200;
    const height = frame.height ?? 150;

    // 检查与已放置 Frame 的重叠，最多尝试 100 次
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      const currentRect = { x: currentX, y: currentY, width, height };
      let hasOverlap = false;
      let maxOverlapRight = currentX;

      for (const placed of placedFrames) {
        const placedRect = {
          x: placed.x ?? 0,
          y: placed.y ?? 0,
          width: placed.width ?? 0,
          height: placed.height ?? 0,
        };

        if (isOverlapping(currentRect, placedRect, FRAME_GAP)) {
          hasOverlap = true;
          maxOverlapRight = Math.max(
            maxOverlapRight,
            placedRect.x + placedRect.width + FRAME_GAP,
          );
        }
      }

      if (!hasOverlap) {
        break;
      }

      currentX = maxOverlapRight;

      if (currentX > 1200) {
        currentX = originalX;
        const maxY = placedFrames.reduce((max, p) => {
          return Math.max(max, (p.y ?? 0) + (p.height ?? 0));
        }, 0);
        currentY = maxY + FRAME_GAP;
      }

      attempts++;
    }

    // 计算并记录偏移量
    const deltaX = currentX - originalX;
    const deltaY = currentY - originalY;
    frameOffsets.set(frame.id, { deltaX, deltaY });

    // 更新 Frame 位置
    frame.x = currentX;
    frame.y = currentY;
    placedFrames.push(frame);
  }

  // 深度优先遍历：递归移动 children
  const moveChildren = (frameId: string, deltaX: number, deltaY: number) => {
    const frame = elementMap.get(frameId);
    const childIds = frame?._childIds;
    if (!childIds) return;

    for (const childId of childIds) {
      const child = elementMap.get(childId);
      if (!child) continue;

      // 移动 child
      child.x = (child.x ?? 0) + deltaX;
      child.y = (child.y ?? 0) + deltaY;

      // 如果 child 也是 Frame，递归移动其 children
      if (child.type === "frame") {
        moveChildren(childId, deltaX, deltaY);
      }
    }
  };

  // 对每个有偏移的 Frame，递归移动其 children
  for (const [frameId, { deltaX, deltaY }] of frameOffsets) {
    if (deltaX !== 0 || deltaY !== 0) {
      moveChildren(frameId, deltaX, deltaY);
    }
  }

  // 返回更新后的元素，保持原始顺序
  return elements.map((el) => elementMap.get(el.id) ?? el);
};

/**
 * 应用测量尺寸到元素，并重新计算 frame 边界
 */
const applyMeasuredSizes = (
  elements: BoardElement[],
  sizes: Record<string, { width: number; height: number }>,
): BoardElement[] => {
  // 第一步：应用测量尺寸到普通元素
  const elementMap: Record<string, InternalBoardElement> = {};
  const updatedElements = elements.map((el) => {
    const internalEl = el as InternalBoardElement;
    const size = sizes[el.id];
    let updated: InternalBoardElement = internalEl;
    if (size && internalEl._needsMeasure) {
      updated = { ...internalEl, width: size.width, height: size.height };
    }
    elementMap[updated.id] = updated;
    return updated;
  });

  // 第二步：重新计算 frame 宽高（保留 AI 提供的位置）
  const withFrameSizes = updatedElements.map((el) => {
    if (el.type !== "frame") return el;

    const childIds = (el as InternalBoardElement)._childIds || [];
    if (childIds.length === 0) return el;

    const childElements = childIds
      .map((id: string) => elementMap[id])
      .filter(Boolean);

    if (childElements.length === 0) return el;

    // 计算 children 的完整边界
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    childElements.forEach((child: BoardElement) => {
      const childX = child.x ?? 0;
      const childY = child.y ?? 0;
      const childWidth = child.width ?? 0;
      const childHeight = child.height ?? 0;
      minX = Math.min(minX, childX);
      minY = Math.min(minY, childY);
      maxX = Math.max(maxX, childX + childWidth);
      maxY = Math.max(maxY, childY + childHeight);
    });

    if (
      minX === Infinity ||
      minY === Infinity ||
      maxX === -Infinity ||
      maxY === -Infinity
    ) {
      return el;
    }

    // Frame 位置和宽高都根据 children 边界计算
    return {
      ...el,
      x: minX - FRAME_PADDING,
      y: minY - FRAME_PADDING,
      width: Math.max(100, maxX - minX + 2 * FRAME_PADDING),
      height: Math.max(60, maxY - minY + 2 * FRAME_PADDING),
    };
  });

  // 第三步：解决 Frame 重叠问题
  return resolveFrameOverlaps(withFrameSizes);
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

  // 解析获取原始元素
  const { rawElements, error } = useMemo(() => {
    if (!debouncedCode.trim()) {
      return {
        rawElements: [] as BoardElement[],
        error: null as string | null,
      };
    }
    try {
      const parsed = parseWhiteBoard(debouncedCode, isDark);
      return { rawElements: parsed, error: null };
    } catch (err) {
      return {
        rawElements: [],
        error: err instanceof Error ? err.message : "解析失败",
      };
    }
  }, [debouncedCode, isDark]);

  // 提取需要测量的元素
  const measurableElements = useMemo(
    () => extractMeasurableElements(rawElements),
    [rawElements],
  );

  // 生成 hashKey（包含主题信息）
  const hashKey = useMemo(
    () =>
      JSON.stringify({
        version: HASH_VERSION,
        isDark,
      }),
    [isDark],
  );

  // 测量元素尺寸
  const { elementSizes, elementsToMeasure, reportSize } =
    useWhiteBoardMeasurements(measurableElements, {
      hashKey,
      cacheNamespace: "whiteboard",
    });

  // 应用测量尺寸并重新计算 frame 边界
  const finalElements = useMemo(() => {
    return applyMeasuredSizes(rawElements, elementSizes);
  }, [rawElements, elementSizes]);

  // 使用 debouncedCode 的 hash 作为 key，数据变化时强制重新渲染 WhiteBoard
  const boardKey = useMemo(
    () =>
      hashCode(
        debouncedCode +
          (isDark ? "-dark" : "-light") +
          "-" +
          JSON.stringify(elementSizes),
      ),
    [debouncedCode, isDark, elementSizes],
  );

  // 数据变化或首次渲染时自动居中所有元素
  useEffect(() => {
    if (finalElements.length > 0) {
      // 延迟执行以确保 WhiteBoard 已完成渲染
      const timer = setTimeout(() => {
        whiteBoardRef.current?.fitAllElements(50, false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [boardKey, finalElements.length]);

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
              initData={finalElements as any}
              readonly
            />
          </div>
          <div
            className={styles.resizeHandle}
            onMouseDown={handleResizeStart}
          />
        </Suspense>
      )}

      {/* 隐藏的测量容器 */}
      <div
        className="absolute -top-[9999px] -left-[9999px] invisible pointer-events-none -z-10"
        aria-hidden
      >
        {elementsToMeasure.map((item) => (
          <WhiteBoardMeasureElement
            key={`${item.element.id}-${item.hash}`}
            element={item.element}
            hash={item.hash}
            isDark={isDark}
            onMeasured={reportSize}
          />
        ))}
      </div>
    </div>
  );
};

export default React.memo(WhiteBoardRenderer);
