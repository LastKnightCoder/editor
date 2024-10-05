import { useEffect, memo, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { SELECT_AREA_COLOR } from "../../constants";
import { useSelection, useBoard } from "../../hooks";

const SelectArea = memo(() => {
  const board = useBoard();
  const selection = useSelection();

  const [isMoving, setIsMoving] = useState(false);

  const isSelecting = Boolean(selection && selection.selectArea && selection.selectArea.anchor !== selection.selectArea.focus);

  const removeSelect = useMemoizedFn((e: Event) => {
    if (isSelecting || isMoving) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
      e.preventDefault();
    }
  })

  useEffect(() => {
    const onMove = () => {
      setIsMoving(true);
    }
    const onMoveEnd = () => {
      setIsMoving(false);
    }
    board.on('element:move', onMove)
    board.on('element:move-end', onMoveEnd)

    return () => {
      board.off('element:move', onMove)
      board.off('element:move-end', onMoveEnd)
    }
  }, [board])

  // 在选择的过程中禁止选中文本
  useEffect(() => {
    window.addEventListener('selectionchange', removeSelect, true);

    return () => {
      window.removeEventListener('selectionchange', removeSelect, true);
    }
  }, [removeSelect])

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
  )
});

export default SelectArea;