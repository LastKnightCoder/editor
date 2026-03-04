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
  FrameElement,
  Operation,
} from "../../../types";
import { PointUtil, FrameUtil, PathUtil, BoardUtil } from "../../../utils";
import { BOARD_TO_CONTAINER } from "../../../constants";

export const useCreateFrame = () => {
  const board = useBoard();
  const createBoardElementType = useCreateElementType();
  const isMoved = useRef(false);
  const startPoint = useRef<Point | null>(null);
  const currentPoint = useRef<Point | null>(null);
  const createdFrame = useRef<FrameElement | null>(null);
  const createdFramePath = useRef<number[] | null>(null);

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
      const height = Math.abs(currentPoint.current.y - startPoint.current.y);

      if (width < 10 || height < 10) return;

      // 判断创建的Frame是否存在，不存在则创建，存在则更新
      if (!createdFrame.current || !createdFramePath.current) {
        const frame = FrameUtil.createFrame(x, y, width, height);

        // 检查是否有元素被框住
        const elementsInArea = board.children.filter(
          (element: BoardElement) => {
            if (element.type === "frame" || element.type === "arrow")
              return false;

            const parent = BoardUtil.getParent(board, element);
            if (parent && parent.type === "frame") return false;

            return FrameUtil.isElementInFrame(element, frame);
          },
        );

        // 如果有元素被框住，直接创建包含这些元素的 Frame
        // 避免 move_node 路径计算问题
        if (elementsInArea.length > 0) {
          // 先删除被框住的元素
          const removeOps: Operation[] = [];
          // 按路径倒序删除，避免路径变化问题
          const sortedElements = [...elementsInArea].sort((a, b) => {
            const pathA = PathUtil.getPathByElement(board, a);
            const pathB = PathUtil.getPathByElement(board, b);
            if (!pathA || !pathB) return 0;
            return pathB[0] - pathA[0]; // 倒序
          });

          sortedElements.forEach((element) => {
            const path = PathUtil.getPathByElement(board, element);
            if (!path) return;
            removeOps.push({
              type: "remove_node",
              path,
              node: element,
            });
          });

          board.apply(removeOps, false);

          // 创建包含子元素的 Frame
          const frameWithChildren: FrameElement = {
            ...frame,
            children: elementsInArea,
          };

          createdFrame.current = frameWithChildren;
          createdFramePath.current = [board.children.length];

          board.apply(
            [
              {
                type: "insert_node",
                path: [board.children.length],
                node: frameWithChildren,
              },
            ],
            false,
          );
        } else {
          // 没有元素被框住，直接创建空 Frame
          createdFrame.current = frame;
          createdFramePath.current = [board.children.length];
          board.apply(
            [
              {
                type: "insert_node",
                path: [board.children.length],
                node: frame,
              },
            ],
            false,
          );
        }

        // 更新 frame path（Board.apply 会克隆节点）
        const latestFrame = BoardUtil.getElementById(
          board,
          createdFrame.current.id,
        );
        const latestFramePath =
          latestFrame && PathUtil.getPathByElement(board, latestFrame);
        if (latestFramePath) {
          createdFramePath.current = latestFramePath;
        }
      } else {
        // 更新现有Frame的尺寸
        const frame = createdFrame.current;
        const updatedFrame: FrameElement = {
          ...frame,
          x,
          y,
          width,
          height,
        };

        // 新增的元素（从 board.children 进入 frame）
        const newElementsInArea = board.children.filter(
          (element: BoardElement) => {
            if (element.type === "frame" || element.type === "arrow")
              return false;

            // 已经在 frame 中不能被移进去
            const parent = BoardUtil.getParent(board, element);
            if (parent && parent.type === "frame") return false;

            return FrameUtil.isElementInFrame(element, updatedFrame);
          },
        );

        // 处理移出 frame 的元素
        const outChildren = updatedFrame.children.filter((child) => {
          return !FrameUtil.isElementInFrame(child, updatedFrame);
        });

        // 计算新的 children
        const newChildren = updatedFrame.children.filter((child) => {
          return !outChildren.some((outChild) => outChild.id === child.id);
        });
        const finalChildren = [...newChildren, ...newElementsInArea];

        // 如果有元素变化，使用 remove + insert 方式处理
        const hasElementChanges =
          outChildren.length > 0 || newElementsInArea.length > 0;

        if (hasElementChanges) {
          const ops: Operation[] = [];

          // 1. 删除新进入的元素（按倒序删除避免路径问题）
          if (newElementsInArea.length > 0) {
            const sortedNewElements = [...newElementsInArea].sort((a, b) => {
              const pathA = PathUtil.getPathByElement(board, a);
              const pathB = PathUtil.getPathByElement(board, b);
              if (!pathA || !pathB) return 0;
              return pathB[0] - pathA[0];
            });

            sortedNewElements.forEach((element) => {
              const path = PathUtil.getPathByElement(board, element);
              if (!path) return;
              ops.push({
                type: "remove_node",
                path,
                node: element,
              });
            });
          }

          // 2. 删除当前 frame
          const framePath = createdFramePath.current;
          if (framePath) {
            ops.push({
              type: "remove_node",
              path: framePath,
              node: frame,
            });
          }

          // 3. 插入移出的元素到 board
          outChildren.forEach((child) => {
            ops.push({
              type: "insert_node",
              path: [board.children.length - newElementsInArea.length],
              node: child,
            });
          });

          board.apply(ops, false);

          // 4. 插入更新后的 frame（包含新的 children）
          const newFrame: FrameElement = {
            ...updatedFrame,
            children: finalChildren,
          };

          board.apply(
            [
              {
                type: "insert_node",
                path: [board.children.length],
                node: newFrame,
              },
            ],
            false,
          );

          createdFrame.current = newFrame;
        } else {
          // 没有元素变化，只更新 frame 尺寸
          const framePath = createdFramePath.current;
          if (!framePath) return;

          board.apply(
            [
              {
                type: "set_node",
                path: framePath,
                properties: {
                  x: frame.x,
                  y: frame.y,
                  width: frame.width,
                  height: frame.height,
                },
                newProperties: {
                  x: updatedFrame.x,
                  y: updatedFrame.y,
                  width: updatedFrame.width,
                  height: updatedFrame.height,
                },
              },
            ],
            false,
          );

          createdFrame.current = updatedFrame;
        }

        // 需要重新更新 path
        const latestFrame = BoardUtil.getElementById(
          board,
          createdFrame.current.id,
        );
        const newPath =
          latestFrame && PathUtil.getPathByElement(board, latestFrame);
        if (newPath) {
          createdFramePath.current = newPath;
        }
      }
    },
    { wait: 25 },
  );

  useEffect(() => {
    if (createBoardElementType !== ECreateBoardElementType.Frame) return;

    const onPointerDown = (e: PointerEvent) => {
      if (createBoardElementType !== ECreateBoardElementType.Frame) return;
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
        createdFrame.current &&
        createdFramePath.current
      ) {
        const ops: Operation[] = [];
        const newBounds = FrameUtil.calculateFrameBounds(
          board,
          createdFrame.current,
        );

        const updatedFrame = {
          ...createdFrame.current,
          ...newBounds,
        };

        // 后面会执行插入，因为这里都是临时创建，不影响历史记录，后面需要一条真正的插入操作
        ops.push({
          type: "remove_node",
          path: createdFramePath.current,
          node: createdFrame.current,
        });

        ops.push({
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectArea: null,
            selectedElements: [updatedFrame],
          },
        });

        board.apply(ops, false);

        // 最终插入，会添加到历史记录中
        board.apply({
          type: "insert_node",
          path: [board.children.length],
          node: updatedFrame,
        });
      }

      if (isMoved.current) {
        board.currentCreateType = ECreateBoardElementType.None;
      }
      startPoint.current = null;
      isMoved.current = false;
      createdFrame.current = null;
      createdFramePath.current = null;

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
      isMoved.current = false;
      createdFrame.current = null;
      createdFramePath.current = null;

      document.removeEventListener("pointerup", handlePointerUp);

      const boardContainer = BOARD_TO_CONTAINER.get(board);
      if (!boardContainer) return;

      boardContainer.removeEventListener("pointerdown", onPointerDown);
      boardContainer.removeEventListener("pointermove", handlePointerMove);
    };
  }, [createBoardElementType, handlePointerMove, board]);
};

export default useCreateFrame;
