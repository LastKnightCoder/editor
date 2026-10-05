import React from "react";
import { useViewPort } from "../../hooks";
import {
  DEFAULT_GRID_SIZE,
  DEFAULT_GRID_COLOR,
  DEFAULT_GRID_OPACITY,
  DEFAULT_GRID_VISIBLE,
} from "../../constants";

interface GridProps {
  gridSize?: number;
  color?: string;
  opacity?: number;
  visible?: boolean;
}

const Grid: React.FC<GridProps> = ({
  gridSize = DEFAULT_GRID_SIZE,
  color = DEFAULT_GRID_COLOR,
  opacity = DEFAULT_GRID_OPACITY,
  visible = DEFAULT_GRID_VISIBLE,
}) => {
  const viewPort = useViewPort();
  const { minX, minY, width, height, zoom } = viewPort;

  const startX = Math.floor(minX / gridSize) * gridSize;
  const startY = Math.floor(minY / gridSize) * gridSize;
  const endX = Math.ceil((minX + width) / gridSize) * gridSize;
  const endY = Math.ceil((minY + height) / gridSize) * gridSize;

  if (!visible) {
    return null;
  }

  const horizontalLines = [];
  const verticalLines = [];

  const strokeWidth = 1 / zoom;

  for (let y = startY; y <= endY; y += gridSize) {
    horizontalLines.push(
      <line
        key={`h-${y}`}
        x1={startX}
        y1={y}
        x2={endX}
        y2={y}
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    );
  }

  for (let x = startX; x <= endX; x += gridSize) {
    verticalLines.push(
      <line
        key={`v-${x}`}
        x1={x}
        y1={startY}
        x2={x}
        y2={endY}
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    );
  }

  return (
    <g className="whiteboard-grid">
      {horizontalLines}
      {verticalLines}
    </g>
  );
};

export default Grid;
