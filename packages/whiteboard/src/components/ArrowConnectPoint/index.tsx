import { useRef, useEffect, memo } from "react";
import type { PointerEventHandler } from "react";
import { v4 as getUuid } from "uuid";
import { useMemoizedFn, useThrottleFn } from "ahooks";

import { BOARD_TO_CONTAINER } from "../../constants";
import { useBoard, useZoom } from "../../hooks";
import { PointUtil } from "../../utils";
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
  /**
   * 拖出的箭头松手时没有连到任何元素：返回 true 表示由调用方接手（不提交这条箭头），
   * release 用于在接手结束后撤掉还画着的临时箭头。
   */
  onReleaseInSpace?: (event: {
    point: Point;
    clientX: number;
    clientY: number;
    release(): void;
  }) => boolean;
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
    onReleaseInSpace,
    onPointerEnter,
    onPointerLeave,
  } = props;

  const board = useBoard();
  const zoom = useZoom();

  const ref = useRef<SVGCircleElement>(null);
  const isMoved = useRef(false);
  const startPoint = useRef<Point | null>(null);
  const currentPoint = useRef<Point | null>(null);
  const createdArrow = useRef<ArrowElement | null>(null);
  const previewId = useRef<string | null>(null);
  const canSubmit = useRef<(() => boolean) | null>(null);

  const clearPreview = useMemoizedFn((id = previewId.current) => {
    if (id && board.creationPreview?.element.id === id) board.setCreationPreview(null);
    if (previewId.current === id) previewId.current = null;
  });

  const { getUpdateArrowElement, setAltMode } = useMoveArrow({
    isMoved,
    currentPoint,
  });

  useMoveInAnimate(ref, r);

  const {
    run: handlePointerMove,
    cancel: cancelPointerMove,
    flush: flushPointerMove,
  } = useThrottleFn(
    (e: PointerEvent) => {
      if (!startPoint.current || !canSubmit.current?.()) return;
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
      if (!createdArrow.current) {
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
        previewId.current = createArrow.id;
      }
      board.emit("tau.arrow.update", {
        arrow: createdArrow.current,
        path: [board.children.length],
        currentPoint: currentPoint.current,
      });
      createdArrow.current = getUpdateArrowElement(
        createdArrow.current,
        currentPoint.current,
        createdArrow.current.points.length - 1
      );
      board.setCreationPreview(createdArrow.current, { bounds: false });
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

  const handlePointerUp = useMemoizedFn((event?: Event) => {
    const isPointerUp = event instanceof PointerEvent && event.type === "pointerup";
    if (isPointerUp && startPoint.current && canSubmit.current?.()) {
      handlePointerMove(event);
      flushPointerMove();
    }
    cancelPointerMoveSafely();
    const arrow = createdArrow.current;
    const released =
      !!arrow &&
      !!currentPoint.current &&
      isMoved.current &&
      canSubmit.current?.() &&
      !arrow.target.bindId &&
      isPointerUp &&
      onReleaseInSpace?.({
        point: currentPoint.current,
        clientX: event.clientX,
        clientY: event.clientY,
        release: () => clearPreview(arrow.id),
      }) === true;
    if (released) previewId.current = null;
    else clearPreview();
    if (
      !released &&
      isPointerUp &&
      canSubmit.current?.() &&
      startPoint.current &&
      currentPoint.current &&
      isMoved.current &&
      createdArrow.current
    ) {
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
    canSubmit.current = null;

    board.emit("tau.arrow.move-end");
    removeDragListeners(handlePointerUp);
  });

  const handlePointerDown: PointerEventHandler<SVGCircleElement> = useMemoizedFn(e => {
    if (e.button !== 0) return;
    const submit = board.captureSubmission(element);
    if (!submit()) return;
    e.stopPropagation();
    e.preventDefault();
    onConnectStart?.();
    const boardContainer = BOARD_TO_CONTAINER.get(board);
    if (!boardContainer) return;

    startPoint.current = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!startPoint.current) return;
    clearPreview();
    canSubmit.current = submit;

    boardContainer.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("blur", handlePointerUp);
  });

  useEffect(() => {
    return () => {
      cancelPointerMoveSafely();
      clearPreview();
      if (startPoint.current) board.emit("tau.arrow.move-end");
      removeDragListeners(handlePointerUp);
    };
  }, [board, cancelPointerMoveSafely, clearPreview, handlePointerUp, removeDragListeners]);

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
