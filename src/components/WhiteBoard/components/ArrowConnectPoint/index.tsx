import { useRef, useEffect, memo } from "react";
import { v4 as getUuid } from "uuid";
import { useThrottleFn } from "ahooks";

import { BOARD_TO_CONTAINER } from "../../constants";
import { useBoard, useViewPort } from "../../hooks";
import { PointUtil } from "../../utils";
import {
  ArrowElement,
  EArrowLineType,
  Point,
  EMarkerType,
  BoardElement,
} from "../../types";
import { useMoveArrow } from "../../hooks/useMoveArrow";
import useMoveInAnimate from "./useMoveInAnimate";

interface ArrowConnectPointProps {
  element: BoardElement;
  connectId: string;
  x: number;
  y: number;
  r: number;
  fill: string;
  fillOpacity?: number;
}

const ArrowConnectPoint = memo((props: ArrowConnectPointProps) => {
  const { x, y, r, fill, fillOpacity = 0.8, element, connectId } = props;

  const board = useBoard();
  const { zoom } = useViewPort();

  const ref = useRef<SVGCircleElement>(null);
  const isMoved = useRef(false);
  const startPoint = useRef<Point | null>(null);
  const currentPoint = useRef<Point | null>(null);
  const createdArrow = useRef<ArrowElement | null>(null);
  const createdArrowPath = useRef<number[] | null>(null);

  const { getUpdateArrowElement } = useMoveArrow({
    isMoved,
    currentPoint,
  });

  useMoveInAnimate(ref, r);

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

      const bindStartPoint = board.getArrowBindPoint(element, connectId);
      if (!bindStartPoint) return;

      // 判断创建的箭头是否存在，不存在则创建，存在则更新
      if (!createdArrow.current || !createdArrowPath.current) {
        const createArrow: ArrowElement = {
          id: getUuid(),
          type: "arrow",
          lineType: EArrowLineType.STRAIGHT,
          source: {
            marker: EMarkerType.None,
            bindId: element.id,
            connectId,
          },
          target: {
            marker: EMarkerType.Arrow,
          },
          points: [bindStartPoint, currentPoint.current],
          lineWidth: 2,
          lineColor: "#36282b",
        };
        createdArrow.current = createArrow;
        createdArrowPath.current = [board.children.length];
        board.apply(
          [
            {
              type: "insert_node",
              path: [board.children.length],
              node: createArrow,
            },
          ],
          false,
        );
      } else {
        const updateArrowElement = getUpdateArrowElement(
          createdArrow.current,
          currentPoint.current,
          createdArrow.current.points.length - 1,
        );

        board.apply(
          [
            {
              type: "set_node",
              path: createdArrowPath.current,
              properties: createdArrow.current,
              newProperties: updateArrowElement,
            },
          ],
          false,
        );
        createdArrow.current = updateArrowElement;
        // 让其他元素监听，是否显示 arrow drop connect point
        board.emit("arrow:update", {
          arrow: createdArrow.current,
          path: createdArrowPath.current,
          currentPoint: currentPoint.current,
        });
      }
    },
    { wait: 25 },
  );

  useEffect(() => {
    const circle = ref.current;
    if (!circle) return;

    const onPointerDown = (e: PointerEvent) => {
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

    const handlePointerUp = (_e: PointerEvent) => {
      if (
        startPoint.current &&
        currentPoint.current &&
        isMoved.current &&
        createdArrow.current &&
        createdArrowPath.current
      ) {
        board.apply(
          [
            {
              type: "remove_node",
              path: createdArrowPath.current,
              node: createdArrow.current,
            },
          ],
          false,
        );
        board.apply(
          [
            {
              type: "insert_node",
              path: [board.children.length],
              node: createdArrow.current,
            },
          ],
          true,
        );
      }

      startPoint.current = null;
      isMoved.current = false;
      createdArrow.current = null;
      createdArrowPath.current = null;

      document.removeEventListener("pointerup", handlePointerUp);
      board.emit("arrow:move-end");

      const boardContainer = BOARD_TO_CONTAINER.get(board);
      if (!boardContainer) return;

      boardContainer.removeEventListener("pointermove", handlePointerMove);
    };

    circle.addEventListener("pointerdown", onPointerDown);

    return () => {
      circle.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
      const boardContainer = BOARD_TO_CONTAINER.get(board);
      if (!boardContainer) return;
      boardContainer.removeEventListener("pointermove", handlePointerMove);
    };
  }, [board, handlePointerMove]);

  return (
    <circle
      ref={ref}
      cx={x}
      cy={y}
      r={r}
      fill={fill}
      fillOpacity={fillOpacity}
    />
  );
});

export default ArrowConnectPoint;
