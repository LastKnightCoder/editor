import { useEffect, memo } from "react";
import { useMemoizedFn } from "ahooks";
import { SELECT_AREA_COLOR } from "../../constants";
import { useSelection, useArrowMove, useBoardState } from "../../hooks";

const SelectArea = memo(() => {
  const selection = useSelection();
  const isArrowMoving = useArrowMove();
  const { isMoving } = useBoardState();

  const isSelecting = Boolean(
    selection &&
    selection.selectArea &&
    selection.selectArea.anchor !== selection.selectArea.focus,
  );

  const clearSelection = useMemoizedFn(() => {
    if (!isSelecting && !isMoving && !isArrowMoving) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      selection.removeAllRanges();
    }
  });

  const handleSelectStart = useMemoizedFn((event: Event) => {
    if (!isSelecting && !isMoving && !isArrowMoving) return;
    event.preventDefault();
    clearSelection();
  });

  // 在选择的过程中禁止选中文本
  useEffect(() => {
    window.addEventListener("selectstart", handleSelectStart, true);
    window.addEventListener("selectionchange", clearSelection, true);

    return () => {
      window.removeEventListener("selectstart", handleSelectStart, true);
      window.removeEventListener("selectionchange", clearSelection, true);
    };
  }, [handleSelectStart, clearSelection]);

  if (!selection || !selection.selectArea) return null;

  const { anchor, focus } = selection.selectArea;

  return (
    <rect
      x={Math.min(anchor.x, focus.x)}
      y={Math.min(anchor.y, focus.y)}
      width={Math.abs(anchor.x - focus.x)}
      height={Math.abs(anchor.y - focus.y)}
      fill={SELECT_AREA_COLOR}
      fillOpacity={0.2}
      stroke={SELECT_AREA_COLOR}
      strokeWidth={1}
    />
  );
});

export default SelectArea;
