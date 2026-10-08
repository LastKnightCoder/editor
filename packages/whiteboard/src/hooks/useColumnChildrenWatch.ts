import { useEffect, useRef } from "react";
import { useDebounceFn } from "ahooks";
import { Board, BoardElement, ColumnElement } from "../types";
import { ColumnUtil } from "../utils";

interface UseColumnChildrenWatchProps {
  board: Board;
  column: ColumnElement;
}

/**
 * Hook to watch for child element changes and trigger Column relayout
 * - Detects when children are added/removed
 * - Detects when children's heights change
 */
const useColumnChildrenWatch = ({ board, column }: UseColumnChildrenWatchProps) => {
  // Store previous children IDs and heights
  // null 表示尚未挂载：首次渲染必定 relayout（空列也要按当前布局规范校正高度）
  const prevChildIdsRef = useRef<string[] | null>(null);
  const prevHeightsRef = useRef<Map<string, number>>(new Map());

  // Debounced relayout
  const { run: debouncedRelayout } = useDebounceFn(
    () => {
      // Find the latest column in board
      const findColumn = (elements: BoardElement[]): ColumnElement | null => {
        for (const el of elements) {
          if (el.id === column.id) return el as ColumnElement;
          if (el.children) {
            const found = findColumn(el.children);
            if (found) return found;
          }
        }
        return null;
      };

      const latestColumn = findColumn(board.children);
      if (latestColumn) {
        ColumnUtil.relayout(board, latestColumn);
      }
    },
    { wait: 16 }
  );

  // Check for children changes on every render
  useEffect(() => {
    const currentIds = column.children.map(c => c.id);
    const prevIds = prevChildIdsRef.current;

    // Check if children list changed
    const childrenChanged =
      prevIds === null ||
      currentIds.length !== prevIds.length ||
      currentIds.some((id, i) => id !== prevIds[i]);

    if (childrenChanged) {
      prevChildIdsRef.current = currentIds;

      // Update heights map
      const newHeights = new Map<string, number>();
      column.children.forEach(child => {
        newHeights.set(child.id, child.height || 0);
      });
      prevHeightsRef.current = newHeights;

      // Trigger relayout
      debouncedRelayout();
      return;
    }

    // Check for height changes
    let heightChanged = false;
    column.children.forEach(child => {
      const prevHeight = prevHeightsRef.current.get(child.id);
      const currentHeight = child.height || 0;
      if (prevHeight !== currentHeight) {
        prevHeightsRef.current.set(child.id, currentHeight);
        heightChanged = true;
      }
    });

    if (heightChanged) {
      debouncedRelayout();
    }
  }, [column.children, debouncedRelayout]);
};

export default useColumnChildrenWatch;
