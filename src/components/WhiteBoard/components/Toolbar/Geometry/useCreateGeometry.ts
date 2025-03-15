import { useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { v4 as getUuid } from "uuid";

import { GeometryElement } from "./../../../plugins";
import { useCreateElementType, useBoard, useViewPort } from "../../../hooks";
import { Point, ECreateBoardElementType } from "../../../types";
import { PointUtil, GeometryUtil } from "../../../utils";
import { BOARD_TO_CONTAINER } from "../../../constants";

const useCreateGeometry = () => {
  const board = useBoard();
  const createBoardElementType = useCreateElementType();
  const isMoved = useRef(false);
  const startPoint = useRef<Point | null>(null);
  const currentPoint = useRef<Point | null>(null);
  const createdGeometry = useRef<GeometryElement | null>(null);
  const createdGeometryPath = useRef<number[] | null>(null);
  const geometryCreateId = useRef<string | null>(null);

  const { zoom } = useViewPort();

  const handlePointerDown = useMemoizedFn((e: PointerEvent) => {
    if (createBoardElementType !== ECreateBoardElementType.Geometry) return;
    startPoint.current = PointUtil.screenToViewPort(
      board,
      e.clientX,
      e.clientY,
    );
    if (!startPoint.current) return;

    e.stopPropagation();
    const boardContainer = BOARD_TO_CONTAINER.get(board);
    if (!boardContainer) return;

    boardContainer.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  });

  const handlePointerMove = useMemoizedFn((e: PointerEvent) => {
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

    const createOptions = board.createOptions;

    if (!isMoved.current || !createOptions || !createOptions.paths) return;

    let width = currentPoint.current.x - startPoint.current.x;
    let height = currentPoint.current.y - startPoint.current.y;

    let x = startPoint.current.x;
    let y = startPoint.current.y;

    if (width < 0) {
      x = currentPoint.current.x;
    }

    if (height < 0) {
      y = currentPoint.current.y;
    }

    width = Math.abs(width);
    height = Math.abs(height);

    if (e.shiftKey) {
      const max = Math.max(width, height);
      width = max;
      height = max;
    }

    const geometryStyle = GeometryUtil.getPrevGeometryStyle();

    if (!geometryCreateId.current) {
      geometryCreateId.current = getUuid();
    }

    const geometryType = createOptions.geometryType || "default";
    const defaultExtraInfo = createOptions.defaultExtraInfo || {};

    const geometryElement: GeometryElement = {
      id: geometryCreateId.current,
      type: "geometry",
      geometryType,
      paths: createOptions.paths,
      extraInfo: defaultExtraInfo,
      text: {
        align: "center",
        content: [
          {
            type: "paragraph",
            children: [
              {
                type: "formatted",
                text: "",
              },
            ],
          },
        ],
      },
      x,
      y,
      width,
      height,
      ...geometryStyle,
    };

    if (!createdGeometry.current || !createdGeometryPath.current) {
      createdGeometry.current = geometryElement;
      createdGeometryPath.current = [board.children.length];
      board.apply(
        [
          {
            type: "insert_node",
            path: [board.children.length],
            node: geometryElement,
          },
        ],
        false,
      );
    } else {
      board.apply(
        [
          {
            type: "set_node",
            path: createdGeometryPath.current,
            properties: createdGeometry.current,
            newProperties: geometryElement,
          },
        ],
        false,
      );
      createdGeometry.current = geometryElement;
    }
  });

  const handlePointerUp = useMemoizedFn((_e: PointerEvent) => {
    if (
      startPoint.current &&
      currentPoint.current &&
      isMoved.current &&
      createdGeometry.current &&
      createdGeometryPath.current
    ) {
      board.apply(
        [
          {
            type: "remove_node",
            path: createdGeometryPath.current,
            node: createdGeometry.current,
          },
        ],
        false,
      );

      board.apply(
        [
          {
            type: "insert_node",
            path: [board.children.length],
            node: createdGeometry.current,
          },
        ],
        true,
      );
    }

    if (isMoved.current) {
      board.currentCreateType = ECreateBoardElementType.None;
      board.createOptions = null;
    }
    startPoint.current = null;
    isMoved.current = false;
    createdGeometry.current = null;
    createdGeometryPath.current = null;
    geometryCreateId.current = null;

    document.removeEventListener("pointerup", handlePointerUp);
    const boardContainer = BOARD_TO_CONTAINER.get(board);
    if (!boardContainer) return;

    boardContainer.removeEventListener("pointermove", handlePointerMove);
  });

  useEffect(() => {
    if (createBoardElementType !== ECreateBoardElementType.Geometry) return;
    const boardContainer = BOARD_TO_CONTAINER.get(board);
    if (!boardContainer) return;

    boardContainer.addEventListener("pointerdown", handlePointerDown);
    return () => {
      isMoved.current = false;
      startPoint.current = null;
      currentPoint.current = null;
      createdGeometry.current = null;
      createdGeometryPath.current = null;
      document.removeEventListener("pointerup", handlePointerUp);
      if (boardContainer) {
        boardContainer.removeEventListener("pointermove", handlePointerMove);
        boardContainer.removeEventListener("pointerdown", handlePointerDown);
      }
    };
  }, [
    createBoardElementType,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  ]);
};

export default useCreateGeometry;
