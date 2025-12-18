import { useEffect, useRef } from "react";
import { useThrottleFn } from "ahooks";

import {
  useCreateElementType,
  useViewPort,
  useBoard,
} from "../../../hooks/index";
import {
  ECreateBoardElementType,
  BoardElement,
  Point,
  ColumnElement,
  Operation,
} from "../../../types";
import { PointUtil, ColumnUtil, PathUtil, BoardUtil } from "../../../utils";
import { BOARD_TO_CONTAINER } from "../../../constants";
import { COLUMN_ALLOWED_CHILDREN } from "../../../types/column";

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

      currentPoint.current = PointUtil.screenToViewPort(
        board,
        e.clientX,
        e.clientY,
      );
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
        const elementsInArea = board.children.filter(
          (element: BoardElement) => {
            // Only allow specific types
            if (!COLUMN_ALLOWED_CHILDREN.includes(element.type as any))
              return false;

            // Skip elements already in a container
            const parent = BoardUtil.getParent(board, element);
            if (parent && board.capabilityService.isContainer(parent))
              return false;

            return ColumnUtil.isElementInColumn(board, element, column);
          },
        );

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
          false,
        );

        // Update column path
        const latestColumn = BoardUtil.getElementById(board, column.id);
        const latestColumnPath =
          latestColumn && PathUtil.getPathByElement(board, latestColumn);
        if (latestColumnPath) {
          createdColumnPath.current = latestColumnPath;
        }

        if (
          elementsInArea.length > 0 &&
          createdColumnPath.current &&
          createdColumn.current
        ) {
          const moveOps: Operation[] = [];
          let nextChildIndex = createdColumn.current.children.length;

          elementsInArea.forEach((element) => {
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

            const refreshedColumn = BoardUtil.getElementById(
              board,
              createdColumn.current.id,
            );
            const refreshedPath =
              refreshedColumn &&
              PathUtil.getPathByElement(board, refreshedColumn);
            if (refreshedPath) {
              createdColumnPath.current = refreshedPath;
            }
          }
        }
      } else {
        const ops: Operation[] = [];
        const column = createdColumn.current;

        // Calculate new height based on children
        const calculatedHeight = ColumnUtil.calculateHeight(board, column);

        const updatedColumn: ColumnElement = {
          ...column,
          x,
          y,
          width,
          height: calculatedHeight,
        };

        // Find new elements in area
        const newElementsInArea = board.children.filter(
          (element: BoardElement) => {
            if (!COLUMN_ALLOWED_CHILDREN.includes(element.type as any))
              return false;

            const parent = BoardUtil.getParent(board, element);
            if (parent && board.capabilityService.isContainer(parent))
              return false;

            return ColumnUtil.isElementInColumn(board, element, updatedColumn);
          },
        );

        // Handle elements leaving column
        const outChildren = updatedColumn.children.filter((child) => {
          return !ColumnUtil.isElementInColumn(board, child, updatedColumn);
        });

        outChildren.forEach((child) => {
          const oldPath = PathUtil.getPathByElement(board, child);
          if (!oldPath) return;

          const newPath = [board.children.length];

          ops.push({
            type: "move_node",
            path: oldPath,
            newPath,
          });
        });

        // Handle new elements entering column
        const columnPath = createdColumnPath.current;
        if (!columnPath) return;

        newElementsInArea.forEach((element) => {
          const oldPath = PathUtil.getPathByElement(board, element);
          if (!oldPath) return;
          if (!createdColumn.current) return;

          const newPath = [
            ...columnPath,
            createdColumn.current.children.length,
          ];

          ops.push({
            type: "move_node",
            path: oldPath,
            newPath,
          });
        });

        updatedColumn.children = updatedColumn.children.filter((child) => {
          return !outChildren.some((outChild) => outChild.id === child.id);
        });
        updatedColumn.children = [
          ...updatedColumn.children,
          ...newElementsInArea,
        ];

        ops.push({
          type: "set_node",
          path: createdColumnPath.current,
          properties: createdColumn.current,
          newProperties: updatedColumn,
        });

        board.apply(ops, false);
        createdColumn.current = updatedColumn;

        const newPath = PathUtil.getPathByElement(board, updatedColumn);
        if (!newPath) {
          return;
        }
        createdColumnPath.current = newPath;
      }
    },
    { wait: 25 },
  );

  useEffect(() => {
    if (createBoardElementType !== ECreateBoardElementType.Column) return;

    const onPointerDown = (e: PointerEvent) => {
      if (createBoardElementType !== ECreateBoardElementType.Column) return;
      e.stopPropagation();
      const boardContainer = BOARD_TO_CONTAINER.get(board);
      if (!boardContainer) return;

      startPoint.current = PointUtil.screenToViewPort(
        board,
        e.clientX,
        e.clientY,
      );
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

        // Apply layout to position children correctly
        const layoutedColumn = ColumnUtil.layout(board, createdColumn.current);

        // Remove temporary column
        ops.push({
          type: "remove_node",
          path: createdColumnPath.current,
          node: createdColumn.current,
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
