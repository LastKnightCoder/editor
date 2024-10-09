import { EMarkerType, Point } from "../../types";
import { ARROW_SIZE } from "@/components/WhiteBoard/constants";

const getMiddlePoint = (startPoint: Point, endPoint: Point, hasStartMarker = false, hasEndMarker = false) => {
  // 如果宽度大于高度，取 (startX + 1/4 * w, startY) 和 (startX + 3/4 * w, endY)
  const w = endPoint.x - startPoint.x;
  const h = endPoint.y - startPoint.y;
  if (Math.abs(w) > Math.abs(h)) {
    return [{
      x: startPoint.x + (hasStartMarker ? Math.sign(w) * ARROW_SIZE : 0),
      y: startPoint.y
    }, {
      x: startPoint.x + w / 4,
      y: startPoint.y
    }, {
      x: startPoint.x + w * 3 / 4,
      y: endPoint.y
    }, {
      x: endPoint.x - (hasEndMarker ? Math.sign(w) * ARROW_SIZE : 0),
      y: endPoint.y
    }]
  } else {
    return [{
      x: startPoint.x,
      y: startPoint.y + (hasStartMarker ? Math.sign(h) * ARROW_SIZE : 0)
    }, {
      x: startPoint.x,
      y: startPoint.y + h / 4
    }, {
      x: endPoint.x,
      y: startPoint.y + h * 3 / 4
    }, {
      x: endPoint.x,
      y: endPoint.y - (hasEndMarker ? Math.sign(h) * ARROW_SIZE : 0)
    }]
  }
}

interface CurveArrowProps {
  sourceMarker: EMarkerType;
  targetMarker: EMarkerType;
  lineColor: string;
  lineWidth: number;
  points: Point[];
}

const CurveArrow = (props: CurveArrowProps) => {
  const { sourceMarker, targetMarker, lineColor, lineWidth, points } = props;
  // 根据 points 绘制贝塞尔曲线，控制点由上方的函数得到
  // points 不止两个点，可能是任意多点，使用循环生成
  const path = points.reduce((acc, point, index) => {
    if (index === 0) {
      return acc + `M ${point.x} ${point.y} `
    }
    // 三阶贝塞尔曲线
    const middlePoint = getMiddlePoint(points[index - 1], point, index === 1 && sourceMarker !== EMarkerType.None, index === points.length - 1 && targetMarker !== EMarkerType.None);
    // 如果 point 是最后一个点，并且 targetMarker 不是 none，线
    return acc + `L ${middlePoint[0].x} ${middlePoint[0].y} C ${middlePoint[1].x} ${middlePoint[1].y} ${middlePoint[2].x} ${middlePoint[2].y} ${middlePoint[3].x} ${middlePoint[3].y} L ${point.x} ${point.y} `
  }, '')

  return (
    <g>
      <path
        d={path}
        stroke={lineColor}
        strokeWidth={lineWidth}
        fill={'none'}
        markerEnd={targetMarker !== EMarkerType.None ? `url(#whiteboard-arrow)` : 'none'}
        markerStart={sourceMarker !== EMarkerType.None ? `url(#whiteboard-arrow)` : 'none'}
      />
    </g>
  )
}

export default CurveArrow;
