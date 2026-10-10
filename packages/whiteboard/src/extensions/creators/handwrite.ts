import { v4 as uuid } from "uuid";
import type { CustomCreateGesture, ElementCreateSpec } from "../api";
import type { HandwriteElement } from "../../plugins/HandwritePlugin";
import {
  buildStrokeOutline,
  denormalizePoints,
  getPointsBounds,
  getPrevHandwriteStyle,
  normalizeOutline,
  normalizePoints,
  saveHandwriteStyle,
  type HandwriteInputPoint,
  type HandwriteStyle,
} from "../../utils/HandwriteUtil";
import { clearSelectionOperation } from "./text";

/** 旧 useCreateHandwrite 的采样规则：距上一样本点 ≥1.5 屏幕像素才入点 */
const SAMPLE_DISTANCE_IN_SCREEN = 1.5;
/** 旧 useCreateHandwrite 的单笔点数上限 */
export const MAX_STROKE_POINTS = 2000;

/** 无压感指针（pressure 为 0/缺失）按 0.5 处理，与旧实现一致 */
const normalizePressure = (pressure: number) => (pressure > 0 ? pressure : 0.5);

/** 旧 useCreateHandwrite 的元素构造逻辑（纯函数）：字段与旧实现完全一致 */
export function buildHandwriteElement(
  points: HandwriteInputPoint[],
  style: HandwriteStyle,
  id: string
): HandwriteElement | null {
  if (points.length < 2) return null;
  const outline = buildStrokeOutline(points, style);
  const bounds = getPointsBounds(outline);
  if (!bounds) return null;

  return {
    id,
    type: "handwrite",
    name: "手写",
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    resizable: true,
    points: normalizePoints(points, bounds),
    outline: normalizeOutline(outline, bounds),
    style,
  };
}

/**
 * 手写创建手势（CustomCreateGesture）：拖动中按旧采样规则入点并预览笔迹
 * （不画包围盒描边）；松手从预览元素重建（与旧 up 路径的浮点结果一致），
 * 插入与清空选区同属一个撤销步；少于 2 点不创建；工具保持（画笔连续书写）。
 */
export const handwriteCreateGesture: CustomCreateGesture = {
  begin: ctx => {
    const style = getPrevHandwriteStyle();
    const points: HandwriteInputPoint[] = [
      { x: ctx.point.x, y: ctx.point.y, pressure: normalizePressure(ctx.pressure) },
    ];
    let elementId: string | null = null;
    let previewElement: HandwriteElement | null = null;

    return {
      move: moveCtx => {
        const lastPoint = points[points.length - 1];
        const distance = Math.hypot(moveCtx.point.x - lastPoint.x, moveCtx.point.y - lastPoint.y);
        if (distance * moveCtx.zoom < SAMPLE_DISTANCE_IN_SCREEN) {
          return;
        }
        if (points.length >= MAX_STROKE_POINTS) {
          return;
        }
        points.push({
          x: moveCtx.point.x,
          y: moveCtx.point.y,
          pressure: normalizePressure(moveCtx.pressure),
        });

        if (points.length < 2) return;

        if (!elementId) {
          elementId = uuid();
        }
        const nextElement = buildHandwriteElement(points, style, elementId);
        if (!nextElement) return;
        previewElement = nextElement;
        ctx.preview(nextElement, { bounds: false });
      },
      end: () => {
        if (!previewElement || points.length < 2) return null;
        // 旧 up 路径：从临时元素的归一化点重建，保证与旧实现浮点结果一致
        const rebuilt = buildHandwriteElement(
          denormalizePoints(previewElement.points, {
            x: previewElement.x,
            y: previewElement.y,
            width: previewElement.width,
            height: previewElement.height,
          }),
          previewElement.style,
          previewElement.id
        );
        if (!rebuilt) return null;
        saveHandwriteStyle(rebuilt.style);
        return { element: rebuilt, operations: [clearSelectionOperation(ctx.api.selection)] };
      },
      cancel: () => undefined,
    };
  },
};

export const handwriteCreateSpec: ElementCreateSpec = {
  gesture: handwriteCreateGesture,
  after: "none",
  stay: true,
  hint: () => ["按住拖动书写", "画笔会保持选中"],
};
