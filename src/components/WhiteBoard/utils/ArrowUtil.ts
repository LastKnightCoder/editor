import { EArrowLineType, EMarkerType, Point } from "@/components/WhiteBoard";
import { ARROW_SIZE } from "@/components/WhiteBoard/constants";

interface GetArrowPathParams {
  lineType: EArrowLineType;
  points: Point[];
  sourceMarker: EMarkerType;
  targetMarker: EMarkerType;
}

export class ArrowUtil {
  static getMiddlePoint = (startPoint: Point, endPoint: Point, hasStartMarker = false, hasEndMarker = false) => {
    // 如果宽度大于高度，取 (startX + 1/4 * w, startY) 和 (startX + 3/4 * w, endY)
    const w = endPoint.x - startPoint.x;
    const h = endPoint.y - startPoint.y;
    if (Math.abs(w) >= Math.abs(h)) {
      return [{
        x: startPoint.x + (hasStartMarker ? Math.sign(w) * ARROW_SIZE : 0),
        y: startPoint.y
      }, {
        x: startPoint.x + w / 2,
        y: startPoint.y
      }, {
        x: startPoint.x + w / 2,
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
        y: startPoint.y + h / 2
      }, {
        x: endPoint.x,
        y: startPoint.y + h / 2
      }, {
        x: endPoint.x,
        y: endPoint.y - (hasEndMarker ? Math.sign(h) * ARROW_SIZE : 0)
      }]
    }
  }

  static getArrowPath(arrow: GetArrowPathParams): string {
    const { lineType, points, sourceMarker, targetMarker } = arrow;
    if (lineType === EArrowLineType.STRAIGHT) {
      return points.reduce((path, point, index) => {
        if (index === 0) {
          return `M ${point.x} ${point.y}`;
        } else {
          return `${path} L ${point.x} ${point.y}`;
        }
      }, '');
    } else if (lineType === EArrowLineType.CURVE) {
      return points.reduce((acc, point, index) => {
        if (index === 0) {
          return acc + `M ${point.x} ${point.y} `
        }
        // 三阶贝塞尔曲线
        const middlePoint = this.getMiddlePoint(points[index - 1], point, index === 1 && sourceMarker !== EMarkerType.None, index === points.length - 1 && targetMarker !== EMarkerType.None);
        // 如果 point 是最后一个点，并且 targetMarker 不是 none，线
        return acc + `L ${middlePoint[0].x} ${middlePoint[0].y} C ${middlePoint[1].x} ${middlePoint[1].y} ${middlePoint[2].x} ${middlePoint[2].y} ${middlePoint[3].x} ${middlePoint[3].y} L ${point.x} ${point.y} `
      }, '');
    }

    return '';
  }
}
