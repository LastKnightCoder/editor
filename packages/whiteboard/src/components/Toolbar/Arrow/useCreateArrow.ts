import { useEffect, useRef } from "react";
import { v4 as getUuid } from "uuid";
import { useMemoizedFn, useThrottleFn } from "ahooks";

import {
  useCreateElementType,
  useMoveArrow,
  usePointerViewport,
  useViewPort,
  useBoard,
} from "../../../hooks/index";
import { ArrowElement, CustomOffset, ECreateBoardElementType, Point } from "../../../types";
import {
  BoardUtil,
  PointUtil,
  getNearestCustomConnectCandidate,
  getPrevArrowStylePreset,
} from "../../../utils";
import { ARROW_CONNECT_ID, BOARD_TO_CONTAINER } from "../../../constants";

type ArrowSourceSnapCandidate = {
  elementId: string;
  point: Point;
  customOffset: CustomOffset;
};

export const useCreateArrow = () => {
  const board = useBoard();
  const createBoardElementType = useCreateElementType();
  const pointerViewport = usePointerViewport();
  const isMoved = useRef(false);
  const startPoint = useRef<Point | null>(null);
  const currentPoint = useRef<Point | null>(null);
  const createdArrow = useRef<ArrowElement | null>(null);
  const createdArrowPath = useRef<number[] | null>(null);
  const sourceSnapCandidate = useRef<ArrowSourceSnapCandidate | null>(null);
  const dragSourceSnapCandidate = useRef<ArrowSourceSnapCandidate | null>(null);
  const altKeyRef = useRef(false);

  const { zoom } = useViewPort();

  const { getUpdateArrowElement, setAltMode } = useMoveArrow({
    isMoved,
    currentPoint,
  });

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

      // 透传 alt 键状态：按住 alt 时启用自定义连接点吸附
      setAltMode(e.altKey);

      // 判断创建的箭头是否存在，不存在则创建，存在则更新
      if (!createdArrow.current || !createdArrowPath.current) {
        const preset = getPrevArrowStylePreset();
        const createArrow: ArrowElement = {
          id: getUuid(),
          type: "arrow",
          lineType: preset.lineType,
          source: {
            marker: preset.sourceMarker,
            ...(dragSourceSnapCandidate.current
              ? {
                  bindId: dragSourceSnapCandidate.current.elementId,
                  connectId: ARROW_CONNECT_ID.CUSTOM,
                  customOffset: dragSourceSnapCandidate.current.customOffset,
                }
              : {}),
          },
          target: {
            marker: preset.targetMarker,
          },
          points: [startPoint.current, currentPoint.current],
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
        if (!createdArrow.current || !createdArrowPath.current) return;
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

  const clearSourceSnapPreview = useMemoizedFn(() => {
    sourceSnapCandidate.current = null;
    board.emit("arrow:custom-snap", null);
  });

  useEffect(() => {
    if (createBoardElementType !== ECreateBoardElementType.StraightArrow) {
      clearSourceSnapPreview();
      return;
    }
    if (isMoved.current || !pointerViewport) {
      clearSourceSnapPreview();
      return;
    }

    const updateSourceSnapPreview = () => {
      if (isMoved.current) return;
      if (!altKeyRef.current) {
        clearSourceSnapPreview();
        return;
      }

      const candidate = getNearestCustomConnectCandidate(board.children, pointerViewport, zoom);
      if (!candidate) {
        clearSourceSnapPreview();
        return;
      }

      sourceSnapCandidate.current = {
        elementId: candidate.element.id,
        point: candidate.point,
        customOffset: candidate.customOffset,
      };
      board.emit("arrow:custom-snap", { point: candidate.point });
    };

    const handleKeyChange = (event: KeyboardEvent) => {
      altKeyRef.current = event.altKey;
      updateSourceSnapPreview();
    };

    updateSourceSnapPreview();
    document.addEventListener("keydown", handleKeyChange);
    document.addEventListener("keyup", handleKeyChange);
    window.addEventListener("blur", clearSourceSnapPreview);

    return () => {
      document.removeEventListener("keydown", handleKeyChange);
      document.removeEventListener("keyup", handleKeyChange);
      window.removeEventListener("blur", clearSourceSnapPreview);
    };
  }, [board, clearSourceSnapPreview, createBoardElementType, pointerViewport, zoom]);

  useEffect(() => {
    if (createBoardElementType !== ECreateBoardElementType.StraightArrow) return;
    const onPointerDown = (e: PointerEvent) => {
      if (createBoardElementType !== ECreateBoardElementType.StraightArrow) return;
      e.stopPropagation();
      const boardContainer = BOARD_TO_CONTAINER.get(board);
      if (!boardContainer) return;

      const pointerStartPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
      if (!pointerStartPoint) return;

      const pointerDownCandidate =
        e.altKey && !sourceSnapCandidate.current
          ? getNearestCustomConnectCandidate(board.children, pointerStartPoint, zoom)
          : null;
      dragSourceSnapCandidate.current =
        e.altKey && sourceSnapCandidate.current
          ? sourceSnapCandidate.current
          : pointerDownCandidate
            ? {
                elementId: pointerDownCandidate.element.id,
                point: pointerDownCandidate.point,
                customOffset: pointerDownCandidate.customOffset,
              }
            : null;
      startPoint.current = dragSourceSnapCandidate.current?.point ?? pointerStartPoint;
      if (!startPoint.current) return;
      clearSourceSnapPreview();

      boardContainer.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
      document.addEventListener("pointercancel", handlePointerUp);
      window.addEventListener("blur", handlePointerUp);
    };

    const handlePointerUp = () => {
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
            {
              type: "set_selection",
              properties: board.selection,
              newProperties: {
                selectArea: null,
                selectedElements: [createdArrow.current],
              },
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

      if (isMoved.current) {
        board.currentCreateType = ECreateBoardElementType.None;
      }
      startPoint.current = null;
      currentPoint.current = null;
      isMoved.current = false;
      createdArrow.current = null;
      createdArrowPath.current = null;
      dragSourceSnapCandidate.current = null;

      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", handlePointerUp);
      board.emit("arrow:move-end");

      const boardContainer = BOARD_TO_CONTAINER.get(board);
      if (!boardContainer) return;

      boardContainer.removeEventListener("pointermove", handlePointerMove);
    };

    const boardContainer = BOARD_TO_CONTAINER.get(board);
    if (!boardContainer) return;

    boardContainer.addEventListener("pointerdown", onPointerDown);

    return () => {
      cancelPointerMoveSafely();
      isMoved.current = false;
      startPoint.current = null;
      currentPoint.current = null;
      createdArrow.current = null;
      createdArrowPath.current = null;
      sourceSnapCandidate.current = null;
      dragSourceSnapCandidate.current = null;
      altKeyRef.current = false;

      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", handlePointerUp);
      const boardContainer = BOARD_TO_CONTAINER.get(board);
      if (!boardContainer) return;
      boardContainer.removeEventListener("pointermove", handlePointerMove);
      boardContainer.removeEventListener("pointerdown", onPointerDown);
    };
  }, [cancelPointerMoveSafely, createBoardElementType, handlePointerMove, board]);
};

export default useCreateArrow;
