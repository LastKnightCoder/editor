import { useMemoizedFn } from "ahooks";
import Board from "../Board";
import { ViewPortTransforms } from "../transforms";
import { MIN_ZOOM, MAX_ZOOM, FIT_VIEW_PADDING } from "../constants";

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
    ViewPortTransforms.updateZoom(board, Math.min(zoom * 1.1, MAX_ZOOM));
  });

  // 缩小视图
  const handleZoomOut = useMemoizedFn(() => {
    ViewPortTransforms.updateZoom(board, Math.max(zoom / 1.1, MIN_ZOOM));
  });

  // 调整视图到指定缩放比例
  const handleZoomTo = useMemoizedFn((zoomValue: number) => {
    ViewPortTransforms.updateZoom(board, zoomValue);
  });

  // 全览：视图适应全部元素
  const handleFitAll = useMemoizedFn(() => {
    ViewPortTransforms.fitAllElements(board, FIT_VIEW_PADDING, true);
  });

  // 适应选中：视图适应当前选区，无选区时不动
  const handleFitSelection = useMemoizedFn(() => {
    const selected = board.selection.selectedElements;
    if (selected.length === 0) return;
    ViewPortTransforms.fitAllElements(board, FIT_VIEW_PADDING, true, [...selected]);
  });

  return {
    handleContainerResize,
    handleZoomIn,
    handleZoomOut,
    handleZoomTo,
    handleFitAll,
    handleFitSelection,
  };
};

export default useViewPortControls;
