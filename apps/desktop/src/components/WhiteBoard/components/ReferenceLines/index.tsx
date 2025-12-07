import { memo } from "react";
import GradientLine from "../GradientLine";

interface ReferenceLinesProps {
  lines: Array<{
    key: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }>;
  zoom: number;
}

/**
 * 渲染参考线的组件
 */
const ReferenceLines = memo((props: ReferenceLinesProps) => {
  const { lines, zoom } = props;

  if (lines.length === 0) {
    return null;
  }

  return (
    <g>
      {lines.map((line) => (
        <GradientLine
          key={line.key}
          gradientId={line.key}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          startColor="#43CBFF"
          stopColor="#9708CC"
          strokeWidth={2 / zoom}
          strokeDasharray={`${5 / zoom}, ${5 / zoom}`}
        />
      ))}
    </g>
  );
});

export default ReferenceLines;
