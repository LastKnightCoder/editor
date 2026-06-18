import {
  EArrowLineType,
  EMarkerType,
  Point,
  GetArrowPathParams,
  CustomOffset,
} from "../types";
import { ARROW_SIZE, ARROW_CONNECT_ID } from "../constants";
import { getConnectEdgeOrientation } from "./ConnectPointUtil";

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
    sourceCustomOffset?: CustomOffset,
    targetCustomOffset?: CustomOffset,
  ): Point[] => {
    const w = endPoint.x - startPoint.x;
    const h = endPoint.y - startPoint.y;
    const points: Point[] = [];

    // 起点
    points.push({
      x: startPoint.x,
      y: startPoint.y,
    });

    // 根据连接点位置决定路径方向
    // 自定义连接点按所在边缘的法线方向决定先水平/先垂直，与 4 方向语义自然延伸
    const sourceOrientation = getConnectEdgeOrientation(
      sourceConnectId,
      sourceCustomOffset,
    );
    const targetOrientation = getConnectEdgeOrientation(
      targetConnectId,
      targetCustomOffset,
    );

    // 如果有连接点信息，根据连接点类型决定路径方向
    if (sourceConnectId && targetConnectId) {
      // 如果是上下连接（top-bottom或bottom-top），先垂直后水平
      if (
        (sourceConnectId === ARROW_CONNECT_ID.TOP &&
          targetConnectId === ARROW_CONNECT_ID.BOTTOM) ||
        (sourceConnectId === ARROW_CONNECT_ID.BOTTOM &&
          targetConnectId === ARROW_CONNECT_ID.TOP)
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
        (sourceConnectId === ARROW_CONNECT_ID.LEFT &&
          targetConnectId === ARROW_CONNECT_ID.RIGHT) ||
        (sourceConnectId === ARROW_CONNECT_ID.RIGHT &&
          targetConnectId === ARROW_CONNECT_ID.LEFT)
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
      // 含自定义连接点：按各自边缘法线方向决定首段方向
      else if (sourceOrientation || targetOrientation) {
        // 优先用源端方向；源端无法判定时用目标端
        const firstVertical =
          (sourceOrientation ?? targetOrientation) === "vertical";
        if (firstVertical) {
          points.push({ x: startPoint.x, y: startPoint.y + h / 2 });
          points.push({ x: endPoint.x, y: startPoint.y + h / 2 });
        } else {
          points.push({ x: startPoint.x + w / 2, y: startPoint.y });
          points.push({ x: startPoint.x + w / 2, y: endPoint.y });
        }
      }
      // 如果是相邻边连接（如top-right, left-bottom等），使用拐角路径
      else {
        // 确定第一段方向基于起点连接位置
        if (
          sourceConnectId === ARROW_CONNECT_ID.TOP ||
          sourceConnectId === ARROW_CONNECT_ID.BOTTOM
        ) {
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

  // 判断点是否在线段上（或附近）
  static isPointOnLine(
    p0: Point,
    p1: Point,
    point: Point,
    tolerance = 1,
  ): boolean {
    // 计算点到线段的距离
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      // 起点和终点重合
      const dist = Math.sqrt((point.x - p0.x) ** 2 + (point.y - p0.y) ** 2);
      return dist <= tolerance;
    }

    // 计算投影参数 t
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - p0.x) * dx + (point.y - p0.y) * dy) / lengthSquared,
      ),
    );

    // 计算线段上最近的点
    const nearestX = p0.x + t * dx;
    const nearestY = p0.y + t * dy;

    // 计算距离
    const distance = Math.sqrt(
      (point.x - nearestX) ** 2 + (point.y - nearestY) ** 2,
    );

    return distance <= tolerance;
  }

  static getArrowPath(
    arrow: GetArrowPathParams,
    forceVertical = false,
  ): string {
    const { lineType, points, sourceMarker, targetMarker } = arrow;
    if (lineType === EArrowLineType.STRAIGHT) {
      // 如果只有两个点，且有 midPoint，使用分段贝塞尔曲线
      if (points.length === 2 && arrow.midPoint) {
        const startPoint = points[0];
        const endPoint = points[1];
        const midPoint = arrow.midPoint;

        // 判断 midPoint 是否在直线上（或非常接近）
        const isOnLine = this.isPointOnLine(startPoint, endPoint, midPoint, 1); // 容差1像素

        if (isOnLine) {
          // 在直线上，使用直线渲染
          return `M ${startPoint.x} ${startPoint.y} L ${endPoint.x} ${endPoint.y}`;
        } else {
          // 不在直线上，使用二次贝塞尔曲线
          // midPoint 是曲线上的点（用户看到的蓝色圆圈）
          // 需要计算实际的贝塞尔控制点，使曲线在 t=0.5 时通过 midPoint
          // 公式：controlPoint = 2 * midPoint - 0.5 * (startPoint + endPoint)
          const controlPoint = {
            x: 2 * midPoint.x - 0.5 * (startPoint.x + endPoint.x),
            y: 2 * midPoint.y - 0.5 * (startPoint.y + endPoint.y),
          };
          return `M ${startPoint.x} ${startPoint.y} Q ${controlPoint.x} ${controlPoint.y} ${endPoint.x} ${endPoint.y}`;
        }
      }

      // 原有的多点直线逻辑
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
          arrow.sourceCustomOffset,
          arrow.targetCustomOffset,
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
