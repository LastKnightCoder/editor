import React from "react";
import { GeometryRendererProps } from "../GeometryRendererRegistry";

const RectangleRenderer: React.FC<GeometryRendererProps> = ({
  element,
  width,
  height,
  fill,
  fillOpacity,
  stroke,
  strokeWidth,
  strokeOpacity,
}) => {
  // 从 extraInfo 中获取圆角值，如果不存在则默认为 0
  const cornerRadius = element.extraInfo?.cornerRadius || 0;

  return (
    <rect
      x="0"
      y="0"
      width={width}
      height={height}
      rx={cornerRadius}
      ry={cornerRadius}
      fill={fill}
      fillOpacity={fillOpacity}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeOpacity={strokeOpacity}
    />
  );
};

export default RectangleRenderer;
