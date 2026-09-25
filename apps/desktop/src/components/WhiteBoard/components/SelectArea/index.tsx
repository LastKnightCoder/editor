import { memo } from "react";
import { SELECT_AREA_COLOR } from "../../constants";
import { useSelection } from "../../hooks";

const SelectArea = memo(() => {
  const selection = useSelection();

  if (!selection || !selection.selectArea) return null;

  const { anchor, focus } = selection.selectArea;

  return (
    <rect
      x={Math.min(anchor.x, focus.x)}
      y={Math.min(anchor.y, focus.y)}
      width={Math.abs(anchor.x - focus.x)}
      height={Math.abs(anchor.y - focus.y)}
      fill={SELECT_AREA_COLOR}
      fillOpacity={0.12}
      stroke={SELECT_AREA_COLOR}
      strokeWidth={1}
    />
  );
});

export default SelectArea;
