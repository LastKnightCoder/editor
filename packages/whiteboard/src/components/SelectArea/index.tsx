import { memo } from "react";
import { SELECT_AREA_COLOR } from "../../constants";
import { useSelection } from "../../hooks";

const SelectArea = memo(() => {
  const selection = useSelection();
  const selectArea = selection?.selectArea ?? null;

  // 常驻节点、仅切换可见性：选区从无到有的首帧只改属性，不再挂载子树——
  // 挂载属 DOM childList 变更，会触发滚动容器 MutationObserver 的同帧布局测量，
  // 每次框选首帧因此卡顿百 ms 级（出现后仅改属性，故而跟手）
  if (!selectArea) return <rect visibility="hidden" pointerEvents="none" />;

  const { anchor, focus } = selectArea;

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
