import { useEffect, useRef } from "react";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import { v4 as getUuid } from "uuid";
import {
  denormalizePoints,
  getPointsBounds,
  getPrevHandwriteStyle,
  normalizeOutline,
  normalizePoints,
  buildStrokeOutline,
  BoardUtil,
  PointUtil,
  saveHandwriteStyle,
  type HandwriteInputPoint,
  type HandwriteStyle,
} from "../../../utils";
import { BOARD_TO_CONTAINER } from "../../../constants";
import { ECreateBoardElementType, Point } from "../../../types";
import { useBoard, useCreateElementType, useViewPort } from "../../../hooks";
import type { HandwriteElement } from "../../../plugins/HandwritePlugin";

const SAMPLE_DISTANCE_IN_SCREEN = 1.5;
const MAX_STROKE_POINTS = 2000;

const useCreateHandwrite = () => {
  const board = useBoard();
  const createBoardElementType = useCreateElementType();
  const { zoom } = useViewPort();

  const startPoint = useRef<Point | null>(null);
  const pointsRef = useRef<HandwriteInputPoint[]>([]);
  const createdElementRef = useRef<HandwriteElement | null>(null);
  const createdElementPathRef = useRef<number[] | null>(null);
  const createdElementIdRef = useRef<string | null>(null);
  const styleRef = useRef<HandwriteStyle>(getPrevHandwriteStyle());
  const isMovedRef = useRef(false);

  const resetState = useMemoizedFn(() => {
    startPoint.current = null;
    pointsRef.current = [];
    createdElementRef.current = null;
    createdElementPathRef.current = null;
    createdElementIdRef.current = null;
    isMovedRef.current = false;
  });

  const createElementFromPoints = useMemoizedFn(
    (
      points: HandwriteInputPoint[],
      style: HandwriteStyle,
      id: string,
    ): HandwriteElement | null => {
      if (points.length < 2) return null;
      const outline = buildStrokeOutline(points, style);
      const bounds = getPointsBounds(outline);
      if (!bounds) return null;

      return {
        id,
        type: "handwrite",
        name: "手写",
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        resizable: true,
        points: normalizePoints(points, bounds),
        outline: normalizeOutline(outline, bounds),
        style,
      };
    },
  );

  const cleanupListeners = useMemoizedFn(() => {
    const boardContainer = BOARD_TO_CONTAINER.get(board);
    if (boardContainer) {
      boardContainer.removeEventListener("pointermove", handlePointerMove);
    }
    document.removeEventListener("pointerup", handlePointerUp);
  });

  const finalizeElement = useMemoizedFn(() => {
    const createdElement = createdElementRef.current;
    const createdPath = createdElementPathRef.current;

    if (createdElement && createdPath) {
      board.apply(
        {
          type: "remove_node",
          path: createdPath,
          node: createdElement,
        },
        false,
      );
    }

    if (
      !createdElement ||
      pointsRef.current.length < 2 ||
      !isMovedRef.current
    ) {
      return;
    }

    const rebuilt = createElementFromPoints(
      denormalizePoints(createdElement.points, {
        x: createdElement.x,
        y: createdElement.y,
        width: createdElement.width,
        height: createdElement.height,
      }),
      createdElement.style,
      createdElement.id,
    );

    if (!rebuilt) return;

    board.apply(
      [
        {
          type: "insert_node",
          path: [board.children.length],
          node: rebuilt,
        },
        {
          type: "set_selection",
          properties: board.selection,
          newProperties: {
            selectArea: null,
            selectedElements: [],
          },
        },
      ],
      true,
    );

    saveHandwriteStyle(rebuilt.style);
  });

  const handlePointerUp = useMemoizedFn((_e: PointerEvent) => {
    finalizeElement();
    cleanupListeners();
    resetState();
  });

  const { run: handlePointerMove } = useThrottleFn(
    (e: PointerEvent) => {
      if (!startPoint.current) return;

      const nextPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
      if (!nextPoint) return;

      const lastPoint = pointsRef.current[pointsRef.current.length - 1];
      const distance = Math.hypot(
        nextPoint.x - lastPoint.x,
        nextPoint.y - lastPoint.y,
      );

      if (distance * zoom < SAMPLE_DISTANCE_IN_SCREEN) {
        return;
      }

      if (pointsRef.current.length >= MAX_STROKE_POINTS) {
        return;
      }

      pointsRef.current.push({
        x: nextPoint.x,
        y: nextPoint.y,
        pressure: e.pressure > 0 ? e.pressure : 0.5,
      });

      if (!isMovedRef.current && pointsRef.current.length >= 2) {
        isMovedRef.current = true;
      }

      if (pointsRef.current.length < 2) return;

      if (!createdElementIdRef.current) {
        createdElementIdRef.current = getUuid();
      }

      const nextElement = createElementFromPoints(
        pointsRef.current,
        styleRef.current,
        createdElementIdRef.current,
      );
      if (!nextElement) return;

      if (!createdElementRef.current || !createdElementPathRef.current) {
        createdElementRef.current = nextElement;
        createdElementPathRef.current = [board.children.length];
        board.apply(
          {
            type: "insert_node",
            path: [board.children.length],
            node: nextElement,
          },
          false,
        );
      } else {
        const ops = BoardUtil.diffNodePatchOnly(
          createdElementRef.current,
          nextElement,
          createdElementPathRef.current,
        );
        if (ops.length > 0) {
          board.apply(ops, false);
        }
        createdElementRef.current = nextElement;
      }
    },
    { wait: 16 },
  );

  const handlePointerDown = useMemoizedFn((e: PointerEvent) => {
    if (createBoardElementType !== ECreateBoardElementType.Handwrite) return;
    if (e.button !== 0) return;

    const boardContainer = BOARD_TO_CONTAINER.get(board);
    if (!boardContainer) return;

    const point = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!point) return;

    e.stopPropagation();

    styleRef.current = getPrevHandwriteStyle();
    startPoint.current = point;
    pointsRef.current = [
      {
        x: point.x,
        y: point.y,
        pressure: e.pressure > 0 ? e.pressure : 0.5,
      },
    ];
    isMovedRef.current = false;

    boardContainer.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  });

  useEffect(() => {
    if (createBoardElementType !== ECreateBoardElementType.Handwrite) {
      cleanupListeners();
      resetState();
      return;
    }

    const boardContainer = BOARD_TO_CONTAINER.get(board);
    if (!boardContainer) return;

    boardContainer.addEventListener("pointerdown", handlePointerDown);

    return () => {
      boardContainer.removeEventListener("pointerdown", handlePointerDown);
      cleanupListeners();
      resetState();
    };
  }, [
    board,
    createBoardElementType,
    handlePointerDown,
    cleanupListeners,
    resetState,
  ]);
};

export default useCreateHandwrite;
