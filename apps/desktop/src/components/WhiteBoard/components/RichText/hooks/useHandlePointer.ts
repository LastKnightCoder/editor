import { useEffect } from "react";
import { useBoard } from "../../../hooks/useBoard";
import { PointUtil } from "../../../utils";
import { useMemoizedFn } from "ahooks";
import { TextBoxPadding } from "../../../constants/text-style";

interface UseHandlePointerProps {
  container: HTMLDivElement | null;
  padding: TextBoxPadding;
  isSelected: boolean;
  width: number;
  height: number;
}

const useHandlePointer = ({
  container,
  padding,
  isSelected,
  width,
  height,
}: UseHandlePointerProps) => {
  const board = useBoard();

  // 落在内边距（留 2px 容差）视为拖拽区，否则交给编辑器
  const isInPadding = (offsetX: number, offsetY: number) =>
    offsetX < padding.left - 2 ||
    offsetX > width - (padding.right - 2) ||
    offsetY < padding.top - 2 ||
    offsetY > height - (padding.bottom - 2);

  const handlePointerDown = useMemoizedFn((e: React.PointerEvent) => {
    if (!container) return;
    const currentPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    const { x, y } = container.getBoundingClientRect();
    const containerPoint = PointUtil.screenToViewPort(board, x, y);
    if (!currentPoint || !containerPoint) return;
    const offsetX = currentPoint.x - containerPoint.x;
    const offsetY = currentPoint.y - containerPoint.y;
    const isHitPadding = isInPadding(offsetX, offsetY);
    if (!isSelected && !isHitPadding) {
      e.stopPropagation();
    }
  });

  // 鼠标样式
  const handleOnPointerMove = useMemoizedFn((e: React.PointerEvent) => {
    if (!container) return;
    const currentPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    const { x, y } = container.getBoundingClientRect();
    const containerPoint = PointUtil.screenToViewPort(board, x, y);
    if (!currentPoint || !containerPoint) return;
    const offsetX = currentPoint.x - containerPoint.x;
    const offsetY = currentPoint.y - containerPoint.y;
    // 没有内容的时候方便编辑
    const isHitPadding = isInPadding(offsetX, offsetY);
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
