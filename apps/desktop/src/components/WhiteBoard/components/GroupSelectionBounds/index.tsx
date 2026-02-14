import { memo, useMemo } from "react";
import { SELECT_RECT_STROKE, SELECT_RECT_STROKE_WIDTH } from "../../constants";
import { useBoard, useSelection } from "../../hooks";
import {
  getSelectedGroupBounds,
  GroupSelectionBounds as GroupBounds,
} from "../../utils";

const GroupSelectionBounds = memo(() => {
  const board = useBoard();
  const selection = useSelection();

  const groupRects = useMemo(() => {
    if (!selection) return [] as GroupBounds[];
    return getSelectedGroupBounds(board, selection.selectedElements);
  }, [board, selection]);

  if (groupRects.length === 0) return null;

  return (
    <g style={{ pointerEvents: "none" }}>
      {groupRects.map((rect) => (
        <rect
          key={rect.groupId}
          x={rect.minX}
          y={rect.minY}
          width={Math.max(1, rect.maxX - rect.minX)}
          height={Math.max(1, rect.maxY - rect.minY)}
          fill={"transparent"}
          stroke={SELECT_RECT_STROKE}
          strokeWidth={SELECT_RECT_STROKE_WIDTH}
          strokeDasharray={"8 5"}
          rx={4}
          ry={4}
        />
      ))}
    </g>
  );
});

export default GroupSelectionBounds;
