import { v4 as uuid } from "uuid";
import type { CreateGestureSession, CustomCreateGesture, ElementCreateSpec } from "../api";
import type { ArrowElement, CustomOffset, Point } from "../../types";
import type { ArrowStylePreset } from "../../utils/ArrowStyleUtil";
import { getPrevArrowStylePreset } from "../../utils/ArrowStyleUtil";
import { getNearestCustomConnectCandidate } from "../../utils/ConnectPointUtil";
import { ArrowConnectTracker } from "../../utils/ArrowConnectTracker";
import { constrainCreateGeometry } from "../../interactions/createGesture";
import { ARROW_CONNECT_ID } from "../../constants";

/** 旧 useCreateArrow 判定为拖动的屏幕像素阈值 */
const ARROW_CREATE_MOVE_THRESHOLD_SCREEN = 5;

/** 按住 Alt 按下时起点的自定义连接点吸附候选 */
export interface ArrowSourceSnap {
  elementId: string;
  point: Point;
  customOffset: CustomOffset;
}

/** 旧 useCreateArrow 的元素构造逻辑（纯函数）：字段与旧实现完全一致 */
export function buildArrowElement(
  preset: ArrowStylePreset,
  startPoint: Point,
  endPoint: Point,
  sourceSnap: ArrowSourceSnap | null
): ArrowElement {
  return {
    id: uuid(),
    type: "arrow",
    lineType: preset.lineType,
    source: {
      marker: preset.sourceMarker,
      ...(sourceSnap
        ? {
            bindId: sourceSnap.elementId,
            connectId: ARROW_CONNECT_ID.CUSTOM,
            customOffset: sourceSnap.customOffset,
          }
        : {}),
    },
    target: {
      marker: preset.targetMarker,
    },
    points: [startPoint, endPoint],
    lineWidth: preset.lineWidth,
    themeColorId: preset.themeColorId,
    dashed: preset.dashed,
    dashArray: preset.dashArray,
    animated: preset.animated,
    animationSpeed: preset.animationSpeed,
  };
}

/**
 * 箭头创建手势（CustomCreateGesture）：拖动中以预览呈现箭头并按旧事件协议
 * （tau.arrow.update / tau.arrow.drop / tau.arrow.custom-snap / tau.arrow.move-end）驱动连接点覆盖层；
 * Shift 将终点吸附到 45° 方向（新增能力），Alt 启用自定义连接点吸附；
 * 松手返回最后状态的箭头（含端点绑定字段），单击不创建且工具保持。
 */
export const arrowCreateGesture: CustomCreateGesture = {
  begin: ctx => {
    const preset = getPrevArrowStylePreset();
    // 旧 pointerdown：按住 Alt 时起点吸附最近的自定义连接点，并写入 source 绑定
    const sourceCandidate = ctx.alt
      ? getNearestCustomConnectCandidate(ctx.api.children, ctx.start, ctx.zoom)
      : null;
    const sourceSnap: ArrowSourceSnap | null = sourceCandidate
      ? {
          elementId: sourceCandidate.element.id,
          point: sourceCandidate.point,
          customOffset: sourceCandidate.customOffset,
        }
      : null;
    const startPoint = sourceSnap ? { ...sourceSnap.point } : { ...ctx.start };

    let zoom = ctx.zoom;
    let moved = false;
    let currentPoint: Point | null = null;
    let arrow: ArrowElement | null = null;

    const tracker = new ArrowConnectTracker(ctx.api, {
      isMoved: () => moved,
      currentPoint: () => currentPoint,
      zoom: () => zoom,
    });
    const detachTracker = tracker.attach();

    const session: CreateGestureSession = {
      move: moveCtx => {
        zoom = moveCtx.zoom;
        if (!moved) {
          const distance = Math.hypot(
            moveCtx.point.x - startPoint.x,
            moveCtx.point.y - startPoint.y
          );
          if (distance * zoom <= ARROW_CREATE_MOVE_THRESHOLD_SCREEN) return;
          moved = true;
        }
        // Shift 吸附 45°（line 约束保持长度）；Alt 无约束语义
        const end = constrainCreateGeometry(
          "line",
          startPoint,
          moveCtx.point,
          moveCtx.shift,
          false
        ).end;
        currentPoint = end;
        // 透传 alt 键状态：按住 alt 时端点启用自定义连接点吸附
        tracker.setAltMode(moveCtx.alt);

        if (!arrow) {
          arrow = buildArrowElement(preset, startPoint, end, sourceSnap);
          ctx.preview(arrow, { bounds: false });
          return;
        }
        arrow = tracker.getUpdateArrowElement(arrow, end, arrow.points.length - 1);
        ctx.preview(arrow, { bounds: false });
        // 让其他元素监听，是否显示 arrow drop connect point
        ctx.api.emit("tau.arrow.update", {
          arrow,
          path: [ctx.api.children.length],
          currentPoint: end,
        });
      },
      end: () => {
        detachTracker();
        ctx.api.emit("tau.arrow.move-end");
        return arrow;
      },
      cancel: () => {
        detachTracker();
        ctx.api.emit("tau.arrow.move-end");
      },
    };
    return session;
  },
};

export const arrowCreateSpec: ElementCreateSpec = {
  gesture: arrowCreateGesture,
  after: "select",
  hint: () => ["拖拽绘制箭头", "Shift 吸附 45°"],
};
