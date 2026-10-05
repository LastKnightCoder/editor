import React, { useId } from "react";
import { useViewPort } from "../../hooks";
import {
  DEFAULT_GRID_SIZE,
  DEFAULT_GRID_COLOR,
  DEFAULT_GRID_OPACITY,
  DEFAULT_GRID_VISIBLE,
} from "../../constants";
import { getDotGridLevel } from "./dotGridLevel";

interface GridProps {
  gridSize?: number;
  color?: string;
  opacity?: number;
  visible?: boolean;
}

/**
 * 点阵背景：两层 SVG pattern 平铺（次级点 + 间距 2 倍的主点），节点数恒为 2 个 rect，与缩放、视口大小无关。
 * 点半径固定屏幕 1px；缩小时按 getDotGridLevel 翻倍点距，次级点随屏幕点距渐显，层级切换无跳变。
 */
const Grid: React.FC<GridProps> = ({
  gridSize = DEFAULT_GRID_SIZE,
  color = DEFAULT_GRID_COLOR,
  opacity = DEFAULT_GRID_OPACITY,
  visible = DEFAULT_GRID_VISIBLE,
}) => {
  // 同屏可能有多块白板（保活页、导出截图），pattern id 必须实例唯一
  // useId 含 `:` / `«»`，不能直接放进 url(#…) 引用
  const id = `wb-grid-${useId().replace(/[^\w-]/g, "")}`;
  const viewPort = useViewPort();
  const { minX, minY, width, height, zoom } = viewPort;

  if (!visible || !(gridSize > 0) || !(zoom > 0)) {
    return null;
  }

  const { step, minorOpacity } = getDotGridLevel(gridSize, zoom);
  const radius = 1 / zoom;
  const minorId = `${id}-dots-minor`;
  const majorId = `${id}-dots-major`;

  return (
    <g className="whiteboard-grid" opacity={opacity} pointerEvents="none">
      <defs>
        {/* circle 在格子中心，pattern 原点回退半格，点正好落在 gridSize 的整数倍坐标上（与吸附一致） */}
        <pattern
          id={minorId}
          patternUnits="userSpaceOnUse"
          x={-step / 2}
          y={-step / 2}
          width={step}
          height={step}
        >
          <circle cx={step / 2} cy={step / 2} r={radius} fill={color} />
        </pattern>
        <pattern
          id={majorId}
          patternUnits="userSpaceOnUse"
          x={-step}
          y={-step}
          width={step * 2}
          height={step * 2}
        >
          <circle cx={step} cy={step} r={radius * 1.15} fill={color} />
        </pattern>
      </defs>
      <rect
        x={minX}
        y={minY}
        width={width}
        height={height}
        fill={`url(#${minorId})`}
        opacity={minorOpacity}
      />
      <rect x={minX} y={minY} width={width} height={height} fill={`url(#${majorId})`} />
    </g>
  );
};

export default Grid;
