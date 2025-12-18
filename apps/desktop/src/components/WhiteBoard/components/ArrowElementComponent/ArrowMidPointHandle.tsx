import { memo, useRef, useEffect } from "react";
import { ArrowElement, Point, EArrowLineType } from "../../types";
import { PathUtil, PointUtil } from "../../utils";
import { useBoard } from "../../hooks";
import { BOARD_TO_CONTAINER } from "../../constants";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import useTheme from "@/hooks/useTheme";

interface ArrowMidPointHandleProps {
  arrowElement: ArrowElement;
}

const ArrowMidPointHandle = memo((props: ArrowMidPointHandleProps) => {
  const { arrowElement } = props;
  
  // 所有 Hooks 必须在条件判断之前调用
  const { isDark } = useTheme();
  const board = useBoard();
  const ref = useRef<SVGGElement>(null);
  const startPoint = useRef<Point | null>(null);
  const isMoved = useRef(false);
  const pathRef = useRef<number[] | null>(null);
  const lastArrowElement = useRef<ArrowElement>(arrowElement);
  const originalArrowElement = useRef<ArrowElement>(arrowElement);

  const { run: handlePointerMove } = useThrottleFn(
    (e: PointerEvent) => {
      if (!startPoint.current) return;

      const currentPoint = PointUtil.screenToViewPort(
        board,
        e.clientX,
        e.clientY,
      );
      if (!currentPoint) return;

      if (!isMoved.current) {
        isMoved.current = true;
      }

      if (!pathRef.current) {
        pathRef.current = PathUtil.getPathByElement(
          board,
          lastArrowElement.current,
        );
      }

      if (pathRef.current) {
        const updateArrowElement: ArrowElement = {
          ...lastArrowElement.current,
          midPoint: currentPoint,
        };

        board.apply(
          [
            {
              type: "set_node",
              path: pathRef.current,
              properties: lastArrowElement.current,
              newProperties: updateArrowElement,
            },
            {
              type: "set_selection",
              properties: board.selection,
              newProperties: {
                selectArea: null,
                selectedElements: [updateArrowElement],
              },
            },
          ],
          false,
        );

        lastArrowElement.current = updateArrowElement;
      }
    },
    { wait: 25 },
  );

  const handlePointerUp = useMemoizedFn(() => {
    if (startPoint.current && isMoved.current) {
      if (!pathRef.current) {
        pathRef.current = PathUtil.getPathByElement(
          board,
          lastArrowElement.current,
        );
      }

      if (pathRef.current) {
        board.apply(
          [
            {
              type: "set_node",
              path: pathRef.current,
              properties: originalArrowElement.current,
              newProperties: lastArrowElement.current,
            },
          ],
          true,
        );
      }
    }

    startPoint.current = null;
    isMoved.current = false;
    pathRef.current = null;
    lastArrowElement.current = arrowElement;
    originalArrowElement.current = arrowElement;

    const boardContainer = BOARD_TO_CONTAINER.get(board);
    document.removeEventListener("pointerup", handlePointerUp);
    if (!boardContainer) return;
    boardContainer.removeEventListener("pointermove", handlePointerMove);
  });

  useEffect(() => {
    const g = ref.current;
    if (!g) return;

    const handlePointerDown = (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      startPoint.current = PointUtil.screenToViewPort(
        board,
        e.clientX,
        e.clientY,
      );
      if (!startPoint.current) return;

      const boardContainer = BOARD_TO_CONTAINER.get(board);
      if (!boardContainer) return;

      const path = PathUtil.getPathByElement(board, lastArrowElement.current);
      if (!path) return;

      // 获取最新的箭头元素
      lastArrowElement.current = PathUtil.getElementByPath(
        board,
        path,
      ) as ArrowElement;
      originalArrowElement.current = lastArrowElement.current;

      boardContainer.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    };

    g.addEventListener("pointerdown", handlePointerDown);

    return () => {
      g.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
      const boardContainer = BOARD_TO_CONTAINER.get(board);
      if (!boardContainer) return;
      boardContainer.removeEventListener("pointermove", handlePointerMove);
    };
  }, [board, handlePointerMove, handlePointerUp]);

  // 只对 STRAIGHT 类型且只有两个点的箭头显示中间点手柄
  if (
    arrowElement.lineType !== EArrowLineType.STRAIGHT ||
    arrowElement.points.length !== 2
  ) {
    return null;
  }

  // 计算 midPoint 位置（如果没有，使用默认值：起终点连线中点）
  const startArrowPoint = arrowElement.points[0];
  const endArrowPoint = arrowElement.points[1];
  const midPoint = arrowElement.midPoint || {
    x: (startArrowPoint.x + endArrowPoint.x) / 2,
    y: (startArrowPoint.y + endArrowPoint.y) / 2,
  };

  return (
    <g ref={ref} style={{ cursor: "move" }}>
      {/* 中间点手柄 - 适配深色模式 */}
      <circle
        cx={midPoint.x}
        cy={midPoint.y}
        r={6}
        fill={isDark ? "#1f1f1f" : "white"}
        stroke="#1890ff"
        strokeWidth={2}
      />
    </g>
  );
});

export default ArrowMidPointHandle;
