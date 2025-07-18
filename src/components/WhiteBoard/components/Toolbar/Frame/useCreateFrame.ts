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
          board.emit("frame-create:start");
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

        if (elementsInArea.length > 0) {
          frame.children = elementsInArea;
        }

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
      } else {
        const ops: Operation[] = [];
        // 更新现有Frame的尺寸
        const frame = createdFrame.current;
        const updatedFrame: FrameElement = {
          ...frame,
          x,
          y,
          width,
          height,
        };

        // 新增的元素
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

        // 新增的元素，如果被框住，且之前不在 Frame，删除（应该说是移动到了这个 Frame 中）
        newElementsInArea.forEach((element) => {
          const path = PathUtil.getPathByElement(board, element);
          if (!path) return;
          ops.push({
            type: "remove_node",
            path,
            node: element,
          });
        });

        // 由于调整，之前在 Frame 中的元素可能被移出去了
        const outChildren = updatedFrame.children.filter((child) => {
          return !FrameUtil.isElementInFrame(child, updatedFrame);
        });

        outChildren.forEach((child) => {
          ops.push({
            type: "insert_node",
            path: [board.children.length],
            node: child,
          });
        });

        updatedFrame.children = updatedFrame.children.filter((child) => {
          return !outChildren.some((outChild) => outChild.id === child.id);
        });
        updatedFrame.children = [
          ...updatedFrame.children,
          ...newElementsInArea,
        ];

        ops.push({
          type: "set_node",
          path: createdFramePath.current,
          properties: createdFrame.current,
          newProperties: updatedFrame,
        });

        board.apply(ops, false);

        createdFrame.current = updatedFrame;
        // 需要重新更新 path
        const newPath = PathUtil.getPathByElement(board, updatedFrame);
        if (!newPath) {
          return;
        }
        createdFramePath.current = newPath;
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
        const newBounds = FrameUtil.calculateFrameBounds(createdFrame.current);

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
            selecArea: null,
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
        board.emit("frame-create:end");
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
