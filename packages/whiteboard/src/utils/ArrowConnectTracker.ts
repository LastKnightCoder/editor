import type { ArrowElement, BoardElement, CustomOffset, Point } from "../types";
import { ARROW_CONNECT_ID } from "../constants";
import { isValid } from "./common";
import { getCustomConnectCandidate } from "./ConnectPointUtil";

export type ArrowConnectPointData = {
  element: BoardElement;
  connectPoints: Array<{
    connectId: string;
    point: Point;
  }>;
};

export type CandidateConnectPointData = {
  elementId: string;
  connectId: string;
  distance: number;
  point: Point;
  customOffset?: CustomOffset;
};

/** 事件总线（Board 与 WhiteboardAPI 均结构兼容，监听器签名与公共 API 一致） */
interface ArrowConnectBus {
  on(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
}

/** 拖动共享状态：是否已超过拖动阈值、当前指针（画布坐标）与缩放 */
export interface ArrowConnectDragState {
  isMoved(): boolean;
  currentPoint(): Point | null;
  zoom(): number;
}

/**
 * 箭头端点拖动中的连接点候选追踪（自 useMoveArrow 抽出的共享逻辑）：
 * 维护「进入落点范围的元素」清单并重算候选（5 固定点距离吸附 / Alt 射线-边缘交点），
 * 供拖动箭头端点（React 场景）与创建箭头手势（非 React 场景）复用。
 */
export class ArrowConnectTracker {
  private closingConnectElements: ArrowConnectPointData[] = [];
  private candidateConnectPoints: CandidateConnectPointData[] = [];
  // alt 模式：按住 alt 拖拽时启用自定义连接点吸附（射线-边缘交点）
  private altMode = false;

  constructor(
    private readonly bus: ArrowConnectBus,
    private readonly state: ArrowConnectDragState
  ) {}

  /** 订阅连接点候选事件；返回取消订阅函数 */
  attach(): () => void {
    this.bus.on("tau.arrow.add-closing-elements", this.handleAddClosingElements);
    this.bus.on("tau.arrow.remove-closing-elements", this.handleRemoveClosingElements);
    this.bus.on("tau.arrow.move-end", this.handleArrowMoveEnd);
    return () => {
      this.bus.off("tau.arrow.add-closing-elements", this.handleAddClosingElements);
      this.bus.off("tau.arrow.remove-closing-elements", this.handleRemoveClosingElements);
      this.bus.off("tau.arrow.move-end", this.handleArrowMoveEnd);
    };
  }

  setAltMode(alt: boolean): void {
    this.altMode = alt;
  }

  private emitCustomSnap = (): void => {
    const top = this.candidateConnectPoints[0];
    if (top && top.connectId === ARROW_CONNECT_ID.CUSTOM) {
      this.bus.emit("tau.arrow.custom-snap", { point: top.point });
    } else {
      this.bus.emit("tau.arrow.custom-snap", null);
    }
  };

  private recomputeCandidates = (): void => {
    const zoom = this.state.zoom();
    const mouse = this.state.currentPoint();

    // alt 模式：忽略 5 个固定点，按"中心→鼠标"射线与 bbox 边缘交点生成唯一候选
    if (this.altMode && mouse) {
      this.candidateConnectPoints = this.closingConnectElements
        .map(item => {
          const candidate = getCustomConnectCandidate(
            item.element as BoardElement & {
              x: number;
              y: number;
              width: number;
              height: number;
            },
            mouse,
            zoom
          );
          if (!candidate) return null;
          return {
            elementId: item.element.id,
            connectId: ARROW_CONNECT_ID.CUSTOM,
            distance: candidate.distance,
            point: candidate.point,
            customOffset: candidate.customOffset,
          };
        })
        .filter(isValid)
        .sort((a, b) => a.distance - b.distance);
      this.emitCustomSnap();
      return;
    }

    // 非 alt 模式：清除自定义吸附可视化，沿用 5 点距离吸附
    this.bus.emit("tau.arrow.custom-snap", null);
    const point = this.state.currentPoint();
    this.candidateConnectPoints = this.closingConnectElements
      .map(item => {
        const { element, connectPoints } = item;
        if (!point) return [];

        return connectPoints
          .map(connectPoint => {
            const distance = Math.hypot(
              point.x - connectPoint.point.x,
              point.y - connectPoint.point.y
            );

            if (distance >= 5 / zoom) return;

            return {
              elementId: element.id,
              connectId: connectPoint.connectId,
              distance,
              point: connectPoint.point,
            };
          })
          .filter(isValid);
      })
      .flat()
      .sort((a, b) => a.distance - b.distance);
  };

  private handleAddClosingElements = (data: ArrowConnectPointData): void => {
    if (!this.state.isMoved()) return;

    const { element } = data;

    // 如果 closingConnectPoints 中已经存在该 elementId，则替换
    const index = this.closingConnectElements.findIndex(item => item.element.id === element.id);
    if (index > -1) {
      this.closingConnectElements[index] = data;
    } else {
      this.closingConnectElements.push(data);
    }

    this.recomputeCandidates();
  };

  private handleRemoveClosingElements = (data: ArrowConnectPointData): void => {
    if (!this.state.isMoved()) return;
    const { element } = data;
    const index = this.closingConnectElements.findIndex(item => item.element.id === element.id);
    if (index > -1) {
      this.closingConnectElements.splice(index, 1);
      this.recomputeCandidates();
    }
  };

  private handleArrowMoveEnd = (): void => {
    this.candidateConnectPoints = [];
    this.closingConnectElements = [];
    this.altMode = false;
    this.bus.emit("tau.arrow.custom-snap", null);
  };

  getUpdateArrowElement = (
    originalArrow: ArrowElement,
    currentPoint: Point,
    movedPointIndex: number
  ): ArrowElement => {
    if (!this.state.isMoved()) return originalArrow;
    const { points, source, target } = originalArrow;
    if (points.length <= movedPointIndex) return originalArrow;
    const newPoints = [...points];
    const newSource = { ...source };
    const newTarget = { ...target };
    // 没有候选或者不是第一个和最后一个
    if (this.candidateConnectPoints.length === 0) {
      newPoints[movedPointIndex] = currentPoint;
      if (movedPointIndex === 0 && source.bindId) {
        newSource.bindId = undefined;
        newSource.connectId = undefined;
        newSource.customOffset = undefined;
      } else if (movedPointIndex === points.length - 1 && target.bindId) {
        newTarget.bindId = undefined;
        newTarget.connectId = undefined;
        newTarget.customOffset = undefined;
      }
      this.bus.emit("tau.arrow.drop", {
        elementId: "",
        connectId: "",
      });
    } else {
      const candidateConnectPoint = this.candidateConnectPoints[0];
      const { elementId, connectId, point, customOffset } = candidateConnectPoint;
      if (movedPointIndex === 0) {
        newSource.bindId = elementId;
        newSource.connectId = connectId;
        newSource.customOffset = customOffset;
        newPoints[0] = point;
        this.bus.emit("tau.arrow.drop", {
          elementId,
          connectId,
        });
      } else if (movedPointIndex === points.length - 1) {
        newTarget.bindId = elementId;
        newTarget.connectId = connectId;
        newTarget.customOffset = customOffset;
        newPoints[points.length - 1] = point;
        this.bus.emit("tau.arrow.drop", {
          elementId,
          connectId,
        });
      } else {
        newPoints[movedPointIndex] = currentPoint;
        this.bus.emit("tau.arrow.drop", {
          elementId: "",
          connectId: "",
        });
      }
    }

    return {
      ...originalArrow,
      points: newPoints,
      source: newSource,
      target: newTarget,
    };
  };
}
