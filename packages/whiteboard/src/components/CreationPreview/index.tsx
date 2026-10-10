import { useCallback, useSyncExternalStore } from "react";
import { cn } from "@tau/ui";

import type Board from "../../Board";
import { BOARD_TO_CONTAINER } from "../../constants/map";
import { PointUtil } from "../../utils";

const HIGHLIGHT_PADDING_SCREEN = 3;
const HIGHLIGHT_STROKE_WIDTH = 2;
const HIGHLIGHT_RADIUS_SCREEN = 4;
const BADGE_OFFSET_SCREEN = 8;

const useCreationPreview = (board: Board) => {
  const subscribe = useCallback(
    (listener: () => void) => {
      board.on("creation-preview:change", listener);
      return () => {
        board.off("creation-preview:change", listener);
      };
    },
    [board]
  );
  return useSyncExternalStore(subscribe, () => board.creationPreview);
};

/** 取消退场：整组淡出 120ms，motion-reduce 下无过渡 */
const leavingClass =
  "opacity-0 transition-opacity duration-[120ms] ease-tau-out motion-reduce:transition-none";

/**
 * 创建手势预览覆盖层（svg 内）：高亮元素包围盒 + 预览元素（插件 render）+ 包围盒描边。
 * 预览不进入 children/命中/空间索引，整组 pointer-events-none。
 */
export const CreationPreview = ({ board, zoom }: { board: Board; zoom: number }) => {
  const preview = useCreationPreview(board);
  if (!preview) return null;
  const { element, highlight, leaving, bounds: drawBounds } = preview;

  const bounds = board.getBounds(element);
  const highlightBounds = highlight
    .map(id => {
      const target = findElementById(board, id);
      return target ? board.getBounds(target) : null;
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  return (
    <g data-layer="creation-preview" className={cn("pointer-events-none", leaving && leavingClass)}>
      {highlightBounds.map((box, index) => {
        const padding = HIGHLIGHT_PADDING_SCREEN / zoom;
        return (
          <rect
            key={`highlight-${index}`}
            x={box.minX - padding}
            y={box.minY - padding}
            width={box.maxX - box.minX + padding * 2}
            height={box.maxY - box.minY + padding * 2}
            fill="none"
            stroke="var(--tau-accent-soft)"
            strokeWidth={HIGHLIGHT_STROKE_WIDTH}
            vectorEffect="non-scaling-stroke"
            rx={HIGHLIGHT_RADIUS_SCREEN / zoom}
          />
        );
      })}
      {board.renderElement(element)}
      {drawBounds && bounds && (
        <rect
          data-creation-preview-bounds
          x={bounds.minX}
          y={bounds.minY}
          width={bounds.maxX - bounds.minX}
          height={bounds.maxY - bounds.minY}
          fill="none"
          stroke="var(--tau-accent-text)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  );
};

/**
 * 创建手势的尺寸徽标（画布 HTML 覆盖层）：屏幕空间固定大小，
 * 位于预览包围盒底边中点下方 8 屏幕像素、水平居中；随预览整组淡出。
 */
export const CreationPreviewBadge = ({ board }: { board: Board }) => {
  const preview = useCreationPreview(board);
  if (!preview?.sizeLabel) return null;
  const bounds = board.getBounds(preview.element);
  const container = BOARD_TO_CONTAINER.get(board);
  if (!bounds || !container) return null;

  const anchor = PointUtil.viewPortToScreen(
    board,
    (bounds.minX + bounds.maxX) / 2,
    bounds.maxY + BADGE_OFFSET_SCREEN / board.viewPort.zoom
  );
  if (!anchor) return null;
  const containerRect = container.getBoundingClientRect();

  return (
    <div
      data-creation-preview-badge
      className={cn("pointer-events-none absolute inset-0", preview.leaving && leavingClass)}
    >
      <div
        className="bg-ink-1 text-surface whitespace-nowrap rounded-[5px] px-1.5 py-[3px] font-mono text-[11px] font-medium tabular-nums leading-[1.2]"
        style={{
          position: "absolute",
          left: anchor.x - containerRect.left,
          top: anchor.y - containerRect.top,
          transform: "translateX(-50%)",
        }}
      >
        {preview.sizeLabel}
      </div>
    </div>
  );
};

/** 深度查找（高亮目标可在容器子树内） */
const findElementById = (board: Board, id: string) => {
  const stack = [...board.children];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (current.id === id) return current;
    if (Array.isArray(current.children)) stack.push(...current.children);
  }
  return undefined;
};

export default CreationPreview;
