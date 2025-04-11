import { useEffect, memo, useContext } from "react";
import { useMemoizedFn } from "ahooks";
import { SELECT_AREA_COLOR } from "../../constants";
import { useSelection, useArrowMove } from "../../hooks";
import { BoardStateContext } from "../../context";

const SelectArea = memo(() => {
  const selection = useSelection();
  const isArrowMoving = useArrowMove();
  const { isMoving } = useContext(BoardStateContext);

  const isSelecting = Boolean(
    selection &&
      selection.selectArea &&
      selection.selectArea.anchor !== selection.selectArea.focus,
  );

  const removeSelect = useMemoizedFn((e: Event) => {
    if (isSelecting || isMoving || isArrowMoving) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
      e.preventDefault();
    }
  });

  // 在选择的过程中禁止选中文本
  useEffect(() => {
    window.addEventListener("selectionchange", removeSelect, true);

    return () => {
      window.removeEventListener("selectionchange", removeSelect, true);
    };
  }, [removeSelect]);

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
