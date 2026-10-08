import { useEffect, useRef } from "react";
import { useThrottleFn } from "ahooks";

import { useCreateElementType, useViewPort, useBoard } from "../../../hooks/index";
import {
  ECreateBoardElementType,
  BoardElement,
  Point,
  ColumnElement,
  Operation,
} from "../../../types";
import { PointUtil, ColumnUtil, PathUtil, BoardUtil } from "../../../utils";
import { BOARD_TO_CONTAINER } from "../../../constants";

export const useCreateColumn = () => {
  const board = useBoard();
  const createBoardElementType = useCreateElementType();
  const isMoved = useRef(false);
  const startPoint = useRef<Point | null>(null);
  const currentPoint = useRef<Point | null>(null);
  const createdColumn = useRef<ColumnElement | null>(null);
  const createdColumnPath = useRef<number[] | null>(null);

  const { zoom } = useViewPort();

  const { run: handlePointerMove } = useThrottleFn(
    (e: PointerEvent) => {
      if (!startPoint.current) return;

      currentPoint.current = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
      if (!currentPoint.current) return;

      if (!isMoved.current) {
        const diffX = currentPoint.current.x - startPoint.current.x;
        const diffY = currentPoint.current.y - startPoint.current.y;
        const diffL = Math.hypot(diffX, diffY);
        if (diffL * zoom > 5) {
          isMoved.current = true;
        }
      }

      if (!isMoved.current) return;

      const x = Math.min(startPoint.current.x, currentPoint.current.x);
      const y = Math.min(startPoint.current.y, currentPoint.current.y);
      const width = Math.abs(currentPoint.current.x - startPoint.current.x);

      if (width < 50) return;

      // Create or update Column
      if (!createdColumn.current || !createdColumnPath.current) {
        const column = ColumnUtil.createColumn(x, y, width);

        // Check for elements that should be contained
        const elementsInArea = board.children.filter((element: BoardElement) => {
          // 准入由元素方能力声明决定（canBeContainedBy）
          if (!board.capabilityService.canBeContainedByType(element, "column")) return false;

          // Skip elements already in a container
          const parent = BoardUtil.getParent(board, element);
          if (parent && board.capabilityService.isContainer(parent)) return false;

          return ColumnUtil.isElementInColumn(board, element, column);
        });

        createdColumn.current = column;
        createdColumnPath.current = [board.children.length];
        board.apply(
          [
            {
              type: "insert_node",
              path: [board.children.length],
              node: column,
            },
          ],
          false
        );

        // Update column path
        const latestColumn = BoardUtil.getElementById(board, column.id);
        const latestColumnPath = latestColumn && PathUtil.getPathByElement(board, latestColumn);
        if (latestColumnPath) {
          createdColumnPath.current = latestColumnPath;
        }

        if (elementsInArea.length > 0 && createdColumnPath.current && createdColumn.current) {
          const moveOps: Operation[] = [];
          let nextChildIndex = createdColumn.current.children.length;

          elementsInArea.forEach(element => {
            const oldPath = PathUtil.getPathByElement(board, element);
            if (!oldPath) return;
            moveOps.push({
              type: "move_node",
              path: oldPath,
              newPath: [...createdColumnPath.current!, nextChildIndex],
            });
            nextChildIndex += 1;
          });

          if (moveOps.length > 0) {
            board.apply(moveOps, false);

            createdColumn.current = {
              ...createdColumn.current,
              children: [...createdColumn.current.children, ...elementsInArea],
            };

            const refreshedColumn = BoardUtil.getElementById(board, createdColumn.current.id);
            const refreshedPath =
              refreshedColumn && PathUtil.getPathByElement(board, refreshedColumn);
            if (refreshedPath) {
              createdColumnPath.current = refreshedPath;
            }
          }
        }
      } else {
        const columnId = createdColumn.current.id;
        const columnInBoard = BoardUtil.getElementById(board, columnId) as ColumnElement | null;
        if (!columnInBoard) return;
        const columnPath = PathUtil.getPathByElement(board, columnInBoard);
        if (!columnPath) return;
        createdColumnPath.current = columnPath;

        const moveOps: Operation[] = [];
        const updatedColumnForContainment: ColumnElement = {
          ...columnInBoard,
          x,
          y,
          width,
        };

        // Find new elements in area
        const newElementsInArea = board.children.filter((element: BoardElement) => {
          if (!board.capabilityService.canBeContainedByType(element, "column")) return false;

          const parent = BoardUtil.getParent(board, element);
          if (parent && board.capabilityService.isContainer(parent)) return false;

          return ColumnUtil.isElementInColumn(board, element, updatedColumnForContainment);
        });

        // Handle elements leaving column
        const outChildren = columnInBoard.children.filter(child => {
          return !ColumnUtil.isElementInColumn(board, child, updatedColumnForContainment);
        });

        outChildren.forEach(child => {
          const oldPath = PathUtil.getPathByElement(board, child);
          if (!oldPath) return;

          const newPath = [board.children.length];

          moveOps.push({
            type: "move_node",
            path: oldPath,
            newPath,
          });
        });

        // Handle new elements entering column
        let nextChildIndex = columnInBoard.children.length;
        newElementsInArea.forEach(element => {
          const oldPath = PathUtil.getPathByElement(board, element);
          if (!oldPath) return;

          const newPath = [...columnPath, nextChildIndex];
          nextChildIndex += 1;

          moveOps.push({
            type: "move_node",
            path: oldPath,
            newPath,
          });
        });

        if (moveOps.length > 0) {
          board.apply(moveOps, false);
        }

        // Apply layout via diff ops（不通过 set_node(children)）
        const latestColumn = BoardUtil.getElementById(board, columnId) as ColumnElement | null;
        if (!latestColumn) return;
        const latestPath = PathUtil.getPathByElement(board, latestColumn);
        if (!latestPath) return;
        createdColumnPath.current = latestPath;

        const layoutedColumn = ColumnUtil.layout(board, {
          ...latestColumn,
          x,
          y,
          width,
        });
        const diffOps = BoardUtil.diffNode(latestColumn, layoutedColumn, latestPath);
        BoardUtil.normalizeOperations(diffOps);
        if (diffOps.length > 0) {
          board.apply(diffOps, false);
        }

        createdColumn.current =
          (BoardUtil.getElementById(board, columnId) as ColumnElement | null) ?? layoutedColumn;
      }
    },
    { wait: 25 }
  );

  useEffect(() => {
    if (createBoardElementType !== ECreateBoardElementType.Column) return;

    const onPointerDown = (e: PointerEvent) => {
      if (createBoardElementType !== ECreateBoardElementType.Column) return;
      e.stopPropagation();
      const boardContainer = BOARD_TO_CONTAINER.get(board);
      if (!boardContainer) return;

      startPoint.current = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
      if (!startPoint.current) return;

      boardContainer.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    };

    const handlePointerUp = () => {
      if (
        startPoint.current &&
        currentPoint.current &&
        isMoved.current &&
        createdColumn.current &&
        createdColumnPath.current
      ) {
        const ops: Operation[] = [];

        const columnId = createdColumn.current.id;
        const latestColumn = BoardUtil.getElementById(board, columnId) as ColumnElement | null;
        const latestPath = latestColumn && PathUtil.getPathByElement(board, latestColumn);
        if (!latestColumn || !latestPath) {
          return;
        }
        createdColumnPath.current = latestPath;

        // Apply layout to position children correctly
        const layoutedColumn = ColumnUtil.layout(board, latestColumn);

        // Remove temporary column
        ops.push({
          type: "remove_node",
          path: latestPath,
          node: latestColumn,
        });

        ops.push({
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectArea: null,
            selectedElements: [layoutedColumn],
          },
        });

        board.apply(ops, false);

        // Final insert with layouted column (adds to history)
        board.apply({
          type: "insert_node",
          path: [board.children.length],
          node: layoutedColumn,
        });
      }

      if (isMoved.current) {
        board.currentCreateType = ECreateBoardElementType.None;
      }
      startPoint.current = null;
      currentPoint.current = null;
      isMoved.current = false;
      createdColumn.current = null;
      createdColumnPath.current = null;

      document.removeEventListener("pointerup", handlePointerUp);

      const boardContainer = BOARD_TO_CONTAINER.get(board);
      if (!boardContainer) return;

      boardContainer.removeEventListener("pointermove", handlePointerMove);
    };

    const boardContainer = BOARD_TO_CONTAINER.get(board);
    if (!boardContainer) return;
    boardContainer.addEventListener("pointerdown", onPointerDown);

    return () => {
      startPoint.current = null;
      currentPoint.current = null;
      isMoved.current = false;
      createdColumn.current = null;
      createdColumnPath.current = null;

      document.removeEventListener("pointerup", handlePointerUp);

      const boardContainer = BOARD_TO_CONTAINER.get(board);
      if (!boardContainer) return;

      boardContainer.removeEventListener("pointerdown", onPointerDown);
      boardContainer.removeEventListener("pointermove", handlePointerMove);
    };
  }, [createBoardElementType, handlePointerMove, board]);
};

export default useCreateColumn;
