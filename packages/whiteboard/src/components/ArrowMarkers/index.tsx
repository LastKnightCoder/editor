import { memo } from "react";
import { ARROW_SIZE } from "../../constants";

/**
 * 渲染箭头标记的组件
 */
const ArrowMarkers = memo(() => {
  return (
    <defs>
      {/* 默认箭头 */}
      <marker
        id={`whiteboard-arrow`}
        markerWidth={ARROW_SIZE}
        markerHeight={ARROW_SIZE}
        // 箭头太细了，盖不住底下的线，向左偏移一点
        refX={ARROW_SIZE - 0.5}
        refY={ARROW_SIZE / 2}
        orient="auto-start-reverse"
        markerUnits="strokeWidth"
      >
        <path
          d={`M0,0 L2,${ARROW_SIZE / 2} L0,${ARROW_SIZE} L${ARROW_SIZE},${ARROW_SIZE / 2} Z`}
          fill={"context-stroke"}
          strokeLinejoin="round"
          strokeWidth={1}
          stroke={"context-stroke"}
        />
      </marker>

      {/* 开放式箭头 */}
      <marker
        id={`whiteboard-open-arrow`}
        markerWidth={ARROW_SIZE}
        markerHeight={ARROW_SIZE}
        refX={ARROW_SIZE - 0.5}
        refY={ARROW_SIZE / 2}
        orient="auto-start-reverse"
        markerUnits="strokeWidth"
      >
        <path
          d={`M0,0 L${ARROW_SIZE},${ARROW_SIZE / 2} L0,${ARROW_SIZE}`}
          fill={"none"}
          strokeLinejoin="round"
          strokeWidth={1}
          stroke={"context-stroke"}
        />
      </marker>

      {/* 闭合式箭头 */}
      <marker
        id={`whiteboard-closed-arrow`}
        markerWidth={ARROW_SIZE}
        markerHeight={ARROW_SIZE}
        refX={ARROW_SIZE - 0.5}
        refY={ARROW_SIZE / 2}
        orient="auto-start-reverse"
        markerUnits="strokeWidth"
      >
        <path
          d={`M0,0 L${ARROW_SIZE},${ARROW_SIZE / 2} L0,${ARROW_SIZE} Z`}
          fill={"context-stroke"}
          strokeLinejoin="round"
          strokeWidth={1}
          stroke={"context-stroke"}
        />
      </marker>

      {/* 菱形箭头 */}
      <marker
        id={`whiteboard-diamond`}
        markerWidth={ARROW_SIZE}
        markerHeight={ARROW_SIZE}
        refX={ARROW_SIZE}
        refY={ARROW_SIZE / 2}
        orient="auto-start-reverse"
        markerUnits="strokeWidth"
      >
        <path
          d={`M${ARROW_SIZE / 2},0 L${ARROW_SIZE},${ARROW_SIZE / 2} L${ARROW_SIZE / 2},${ARROW_SIZE} L0,${ARROW_SIZE / 2} Z`}
          fill={"context-stroke"}
          strokeLinejoin="round"
          strokeWidth={1}
          stroke={"context-stroke"}
        />
      </marker>

      {/* 圆形箭头 */}
      <marker
        id={`whiteboard-circle`}
        markerWidth={ARROW_SIZE}
        markerHeight={ARROW_SIZE}
        refX={ARROW_SIZE}
        refY={ARROW_SIZE / 2}
        orient="auto-start-reverse"
        markerUnits="strokeWidth"
      >
        <circle
          cx={ARROW_SIZE / 2}
          cy={ARROW_SIZE / 2}
          r={ARROW_SIZE / 2}
          fill={"context-stroke"}
          stroke={"context-stroke"}
        />
      </marker>
    </defs>
  );
});

export default ArrowMarkers;
