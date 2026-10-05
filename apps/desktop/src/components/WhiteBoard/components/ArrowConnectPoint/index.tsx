import { useRef, useEffect, memo } from "react";
import type { PointerEventHandler } from "react";
import { v4 as getUuid } from "uuid";
import { useMemoizedFn, useThrottleFn } from "ahooks";

import { BOARD_TO_CONTAINER } from "../../constants";
import { useBoard, useViewPort } from "../../hooks";
import { BoardUtil, PointUtil } from "../../utils";
import type { ArrowElement, Point, BoardElement } from "../../types";
import { useMoveArrow } from "../../hooks/useMoveArrow";
import useMoveInAnimate from "./useMoveInAnimate";
import { getPrevArrowStylePreset } from "../../utils";

interface ArrowConnectPointProps {
  element: BoardElement;
  connectId: string;
  x: number;
  y: number;
  r: number;
  fill: string;
  fillOpacity?: number;
  onConnectStart?: () => void;
  onPointerEnter?: PointerEventHandler<SVGCircleElement>;
  onPointerLeave?: PointerEventHandler<SVGCircleElement>;
}

const ArrowConnectPoint = memo((props: ArrowConnectPointProps) => {
  const {
    x,
    y,
    r,
    fill,
    fillOpacity = 0.8,
    element,
    connectId,
    onConnectStart,
    onPointerEnter,
    onPointerLeave,
  } = props;

  const board = useBoard();
  const { zoom } = useViewPort();

  const ref = useRef<SVGCircleElement>(null);
  const isMoved = useRef(false);
  const startPoint = useRef<Point | null>(null);
  const currentPoint = useRef<Point | null>(null);
  const createdArrow = useRef<ArrowElement | null>(null);
  const createdArrowPath = useRef<number[] | null>(null);

  const { getUpdateArrowElement, setAltMode } = useMoveArrow({
    isMoved,
    currentPoint,
  });

  useMoveInAnimate(ref, r);

  const { run: handlePointerMove, cancel: cancelPointerMove } = useThrottleFn(
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

      // 透传 alt 键状态：按住 alt 时目标端点启用自定义连接点吸附
      setAltMode(e.altKey);

      const bindStartPoint = board.getArrowBindPoint(element, connectId);
      if (!bindStartPoint) return;

      // 判断创建的箭头是否存在，不存在则创建，存在则更新
      if (!createdArrow.current || !createdArrowPath.current) {
        const preset = getPrevArrowStylePreset();
        const createArrow: ArrowElement = {
          id: getUuid(),
          type: "arrow",
          lineType: preset.lineType,
          source: {
            marker: preset.sourceMarker,
            bindId: element.id,
            connectId,
          },
          target: {
            marker: preset.targetMarker,
          },
          points: [bindStartPoint, currentPoint.current],
          lineWidth: preset.lineWidth,
          themeColorId: preset.themeColorId,
          dashed: preset.dashed,
          dashArray: preset.dashArray,
          animated: preset.animated,
          animationSpeed: preset.animationSpeed,
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
          false
        );
      } else {
        const updateArrowElement = getUpdateArrowElement(
          createdArrow.current,
          currentPoint.current,
          createdArrow.current.points.length - 1
        );

        const ops = BoardUtil.diffNodePatchOnly(
          createdArrow.current,
          updateArrowElement,
          createdArrowPath.current
        );
        if (ops.length > 0) {
          board.apply(ops, false);
        }
        createdArrow.current = updateArrowElement;
        // 让其他元素监听，是否显示 arrow drop connect point
        board.emit("arrow:update", {
          arrow: createdArrow.current,
          path: createdArrowPath.current,
          currentPoint: currentPoint.current,
        });
      }
    },
    { wait: 25 }
  );

  const cancelPointerMoveSafely = useMemoizedFn(() => {
    cancelPointerMove();
  });

  const removeDragListeners = useMemoizedFn((pointerUpListener: () => void) => {
    cancelPointerMoveSafely();
    document.removeEventListener("pointerup", pointerUpListener);
    document.removeEventListener("pointercancel", pointerUpListener);
    window.removeEventListener("blur", pointerUpListener);
    const boardContainer = BOARD_TO_CONTAINER.get(board);
    if (!boardContainer) return;
    boardContainer.removeEventListener("pointermove", handlePointerMove);
  });

  const handlePointerUp = useMemoizedFn(() => {
    cancelPointerMoveSafely();
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
        false
      );
      board.apply(
        [
          {
            type: "insert_node",
            path: [board.children.length],
            node: createdArrow.current,
          },
        ],
        true
      );
    }

    startPoint.current = null;
    currentPoint.current = null;
    isMoved.current = false;
    createdArrow.current = null;
    createdArrowPath.current = null;

    board.emit("arrow:move-end");
    removeDragListeners(handlePointerUp);
  });

  const handlePointerDown: PointerEventHandler<SVGCircleElement> = useMemoizedFn(e => {
    e.stopPropagation();
    e.preventDefault();
    onConnectStart?.();
    const boardContainer = BOARD_TO_CONTAINER.get(board);
    if (!boardContainer) return;

    startPoint.current = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!startPoint.current) return;

    boardContainer.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("blur", handlePointerUp);
  });

  useEffect(() => {
    return () => {
      cancelPointerMoveSafely();
      removeDragListeners(handlePointerUp);
    };
  }, [cancelPointerMoveSafely, handlePointerUp, removeDragListeners]);

  return (
    <circle
      ref={ref}
      cx={x}
      cy={y}
      r={r}
      fill={fill}
      fillOpacity={fillOpacity}
      focusable={false}
      tabIndex={-1}
      style={{ outline: "none", touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    />
  );
});

export default ArrowConnectPoint;
