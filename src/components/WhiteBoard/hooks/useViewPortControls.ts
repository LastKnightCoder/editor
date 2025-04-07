import { useMemoizedFn } from "ahooks";
import Board from "../Board";
import { ViewPortTransforms } from "../transforms";
import { MIN_ZOOM, MAX_ZOOM } from "../constants";

/**
 * 视口控制相关 hook
 */
const useViewPortControls = (board: Board, zoom: number) => {
  // 处理容器大小变化
  const handleContainerResize = useMemoizedFn(() => {
    ViewPortTransforms.onContainerResize(board);
  });

  // 放大视图
  const handleZoomIn = useMemoizedFn(() => {
    ViewPortTransforms.updateZoom(board, Math.max(zoom / 1.1, MIN_ZOOM));
  });

  // 缩小视图
  const handleZoomOut = useMemoizedFn(() => {
    ViewPortTransforms.updateZoom(board, Math.min(zoom * 1.1, MAX_ZOOM));
  });

  // 调整视图到指定缩放比例
  const handleZoomTo = useMemoizedFn((zoomValue: number) => {
    ViewPortTransforms.updateZoom(board, zoomValue);
  });

  // 全览功能（视图适应所有元素或选中元素）
  const handleFitElements = useMemoizedFn(
    (padding = 50, selectedOnly = true, elements?: any[]) => {
      return (e: React.MouseEvent<HTMLDivElement>) => {
        // 阻止事件冒泡和默认行为
        e.stopPropagation();
        e.preventDefault();

        if (selectedOnly && board.selection.selectedElements.length > 0) {
          // 如果有选中的元素且需要只关注选中元素，则全览选中的元素
          ViewPortTransforms.fitAllElements(board, padding, true, [
            ...board.selection.selectedElements,
          ]);
        } else if (elements && elements.length > 0) {
          // 如果指定了元素且有元素，全览这些指定的元素
          ViewPortTransforms.fitAllElements(board, padding, true, elements);
        } else {
          // 否则全览所有元素
          ViewPortTransforms.fitAllElements(board, padding, true);
        }
      };
    },
  );

  return {
    handleContainerResize,
    handleZoomIn,
    handleZoomOut,
    handleZoomTo,
    handleFitElements,
  };
};

export default useViewPortControls;
