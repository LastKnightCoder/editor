import { useEffect } from "react";
import { useBoard } from "../../../hooks/useBoard";
import { PointUtil } from "../../../utils";
import { useMemoizedFn } from "ahooks";

interface UseHandlePointerProps {
  container: HTMLDivElement | null;
  paddingWidth: number;
  paddingHeight: number;
  isSelected: boolean;
  width: number;
  height: number;
}

const useHandlePointer = ({
  container,
  paddingWidth,
  paddingHeight,
  isSelected,
  width,
  height,
}: UseHandlePointerProps) => {
  const board = useBoard();

  const handlePointerDown = useMemoizedFn((e: React.PointerEvent) => {
    if (!container) return;
    const currentPoint = PointUtil.screenToViewPort(
      board,
      e.clientX,
      e.clientY,
    );
    const { x, y } = container.getBoundingClientRect();
    const containerPoint = PointUtil.screenToViewPort(board, x, y);
    if (!currentPoint || !containerPoint) return;
    const offsetX = currentPoint.x - containerPoint.x;
    const offsetY = currentPoint.y - containerPoint.y;
    const hitWidth = paddingWidth - 2;
    const hitHeight = paddingHeight - 2;
    // offsetX 和 offsetY 在 padding 中
    const isHitPadding =
      offsetX < hitWidth ||
      offsetX > width - hitWidth ||
      offsetY < hitHeight ||
      offsetY > height - hitHeight;
    if (!isSelected && !isHitPadding) {
      e.stopPropagation();
    }
  });

  // 鼠标样式
  const handleOnPointerMove = useMemoizedFn((e: React.PointerEvent) => {
    if (!container) return;
    const currentPoint = PointUtil.screenToViewPort(
      board,
      e.clientX,
      e.clientY,
    );
    const { x, y } = container.getBoundingClientRect();
    const containerPoint = PointUtil.screenToViewPort(board, x, y);
    if (!currentPoint || !containerPoint) return;
    const offsetX = currentPoint.x - containerPoint.x;
    const offsetY = currentPoint.y - containerPoint.y;
    // 没有内容的时候方便编辑
    const hitWidth = paddingWidth - 2;
    const hitHeight = paddingHeight - 2;
    const isHitPadding =
      offsetX < hitWidth ||
      offsetX > width - hitWidth ||
      offsetY < hitHeight ||
      offsetY > height - hitHeight;
    if (isHitPadding || isSelected) {
      container.style.cursor = "move";
    } else {
      // 可编辑的样式
      container.style.cursor = "auto";
    }
  });

  useEffect(() => {
    if (!container) return;

    // @ts-expect-error
    container.addEventListener("pointerdown", handlePointerDown);
    // @ts-expect-error
    container.addEventListener("pointermove", handleOnPointerMove);

    return () => {
      // @ts-expect-error
      container.removeEventListener("pointerdown", handlePointerDown);
      // @ts-expect-error
      container.removeEventListener("pointermove", handleOnPointerMove);
    };
  }, [handlePointerDown, handleOnPointerMove, container]);
};

export default useHandlePointer;
