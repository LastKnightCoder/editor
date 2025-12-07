import {
  EArrowLineType,
  EMarkerType,
  Point,
  GetArrowPathParams,
} from "../types";
import { ARROW_SIZE } from "../constants";

export class ArrowUtil {
  static getMiddlePoint = (
    startPoint: Point,
    endPoint: Point,
    forceVertical = false,
    hasStartMarker = false,
    hasEndMarker = false,
  ) => {
    // 如果宽度大于高度，取 (startX + 1/4 * w, startY) 和 (startX + 3/4 * w, endY)
    const w = endPoint.x - startPoint.x;
    const h = endPoint.y - startPoint.y;
    if (Math.abs(w) >= Math.abs(h) || forceVertical) {
      return [
        {
          x: startPoint.x + (hasStartMarker ? Math.sign(w) * ARROW_SIZE : 0),
          y: startPoint.y,
        },
        {
          x: startPoint.x + w / 2,
          y: startPoint.y,
        },
        {
          x: startPoint.x + w / 2,
          y: endPoint.y,
        },
        {
          x: endPoint.x - (hasEndMarker ? Math.sign(w) * ARROW_SIZE : 0),
          y: endPoint.y,
        },
      ];
    } else {
      return [
        {
          x: startPoint.x,
          y: startPoint.y + (hasStartMarker ? Math.sign(h) * ARROW_SIZE : 0),
        },
        {
          x: startPoint.x,
          y: startPoint.y + h / 2,
        },
        {
          x: endPoint.x,
          y: startPoint.y + h / 2,
        },
        {
          x: endPoint.x,
          y: endPoint.y - (hasEndMarker ? Math.sign(h) * ARROW_SIZE : 0),
        },
      ];
    }
  };

  // 计算正交线的路径点
  static getOrthogonalPoints = (
    startPoint: Point,
    endPoint: Point,
    sourceConnectId?: string,
    targetConnectId?: string,
  ): Point[] => {
    const w = endPoint.x - startPoint.x;
    const h = endPoint.y - startPoint.y;
    const points: Point[] = [];

    // 起点
    points.push({
      x: startPoint.x,
      y: startPoint.y,
    });

    // 根据连接点位置决定路径
    // 如果有连接点信息，根据连接点类型决定路径方向
    if (sourceConnectId && targetConnectId) {
      // 如果是上下连接（top-bottom或bottom-top），先垂直后水平
      if (
        (sourceConnectId === "top" && targetConnectId === "bottom") ||
        (sourceConnectId === "bottom" && targetConnectId === "top")
      ) {
        // 垂直中点
        const midY = startPoint.y + h / 2;
        points.push({
          x: startPoint.x,
          y: midY,
        });
        points.push({
          x: endPoint.x,
          y: midY,
        });
      }
      // 如果是左右连接（left-right或right-left），先水平后垂直
      else if (
        (sourceConnectId === "left" && targetConnectId === "right") ||
        (sourceConnectId === "right" && targetConnectId === "left")
      ) {
        // 水平中点
        const midX = startPoint.x + w / 2;
        points.push({
          x: midX,
          y: startPoint.y,
        });
        points.push({
          x: midX,
          y: endPoint.y,
        });
      }
      // 如果是相邻边连接（如top-right, left-bottom等），使用拐角路径
      else {
        // 确定第一段方向基于起点连接位置
        if (sourceConnectId === "top" || sourceConnectId === "bottom") {
          // 先垂直移动一段距离
          points.push({
            x: startPoint.x,
            y: startPoint.y + h / 2,
          });
          points.push({
            x: endPoint.x,
            y: startPoint.y + h / 2,
          });
        } else {
          // 先水平移动一段距离
          points.push({
            x: startPoint.x + w / 2,
            y: startPoint.y,
          });
          points.push({
            x: startPoint.x + w / 2,
            y: endPoint.y,
          });
        }
      }
    } else {
      // 没有连接点信息时，根据距离决定路径
      if (Math.abs(w) > Math.abs(h)) {
        // 水平方向距离更大，先水平移动，再垂直移动
        points.push({
          x: startPoint.x + w / 2,
          y: startPoint.y,
        });
        points.push({
          x: startPoint.x + w / 2,
          y: endPoint.y,
        });
      } else {
        // 垂直方向距离更大，先垂直移动，再水平移动
        points.push({
          x: startPoint.x,
          y: startPoint.y + h / 2,
        });
        points.push({
          x: endPoint.x,
          y: startPoint.y + h / 2,
        });
      }
    }

    // 终点
    points.push({
      x: endPoint.x,
      y: endPoint.y,
    });

    return points;
  };

  static getArrowPath(
    arrow: GetArrowPathParams,
    forceVertical = false,
  ): string {
    const { lineType, points, sourceMarker, targetMarker } = arrow;
    if (lineType === EArrowLineType.STRAIGHT) {
      return points.reduce((path, point, index) => {
        if (index === 0) {
          return `M ${point.x} ${point.y}`;
        } else {
          return `${path} L ${point.x} ${point.y}`;
        }
      }, "");
    } else if (lineType === EArrowLineType.CURVE) {
      return points.reduce((acc, point, index) => {
        if (index === 0) {
          return acc + `M ${point.x} ${point.y} `;
        }
        // 三阶贝塞尔曲线
        const middlePoint = this.getMiddlePoint(
          points[index - 1],
          point,
          forceVertical,
          index === 1 && sourceMarker !== EMarkerType.None,
          index === points.length - 1 && targetMarker !== EMarkerType.None,
        );
        // 如果 point 是最后一个点，并且 targetMarker 不是 none，线
        return (
          acc +
          `L ${middlePoint[0].x} ${middlePoint[0].y} C ${middlePoint[1].x} ${middlePoint[1].y} ${middlePoint[2].x} ${middlePoint[2].y} ${middlePoint[3].x} ${middlePoint[3].y} L ${point.x} ${point.y} `
        );
      }, "");
    } else if (lineType === EArrowLineType.ORTHOGONAL) {
      // 只有两个点的情况下，计算正交线路径
      if (points.length === 2) {
        const orthogonalPoints = this.getOrthogonalPoints(
          points[0],
          points[1],
          arrow.sourceConnectId,
          arrow.targetConnectId,
        );

        return orthogonalPoints.reduce((path, point, index) => {
          if (index === 0) {
            return `M ${point.x} ${point.y}`;
          } else {
            return `${path} L ${point.x} ${point.y}`;
          }
        }, "");
      }

      // 多个点的情况，直接连接
      return points.reduce((path, point, index) => {
        if (index === 0) {
          return `M ${point.x} ${point.y}`;
        } else {
          return `${path} L ${point.x} ${point.y}`;
        }
      }, "");
    }

    return "";
  }
}
