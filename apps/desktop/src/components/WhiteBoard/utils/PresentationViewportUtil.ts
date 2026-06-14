import type { BoardElement, ElementBounds } from "../types/board";
import {
  FRAME_TITLE_GAP,
  FRAME_TITLE_HEIGHT,
  type FrameElement,
} from "../types/frame";

type ResolveBounds = (element: BoardElement) => ElementBounds | null;

export const getFramePresentationBounds = (
  frame: FrameElement,
): ElementBounds => ({
  minX: frame.x,
  minY: frame.y - FRAME_TITLE_HEIGHT - FRAME_TITLE_GAP,
  maxX: frame.x + frame.width,
  maxY: frame.y + frame.height,
});

export const getPresentationElementBounds = (
  element: BoardElement,
  resolveBounds: ResolveBounds,
): ElementBounds | null => {
  if (element.type === "frame") {
    return getFramePresentationBounds(element as FrameElement);
  }

  if (element.points && Array.isArray(element.points)) {
    const points = element.points as Array<{ x: number; y: number }>;
    if (points.length === 0) return null;

    return points.reduce<ElementBounds>(
      (bounds, point) => ({
        minX: Math.min(bounds.minX, point.x),
        minY: Math.min(bounds.minY, point.y),
        maxX: Math.max(bounds.maxX, point.x),
        maxY: Math.max(bounds.maxY, point.y),
      }),
      {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
      },
    );
  }

  if (
    element.x1 !== undefined &&
    element.y1 !== undefined &&
    element.x2 !== undefined &&
    element.y2 !== undefined
  ) {
    const { x1, y1, x2, y2 } = element;
    if (
      x1 !== undefined &&
      y1 !== undefined &&
      x2 !== undefined &&
      y2 !== undefined
    ) {
      return {
        minX: Math.min(x1, x2),
        minY: Math.min(y1, y2),
        maxX: Math.max(x1, x2),
        maxY: Math.max(y1, y2),
      };
    }
  }

  return resolveBounds(element);
};

export const mergePresentationElementBounds = (
  elements: BoardElement[],
  resolveBounds: ResolveBounds,
): ElementBounds | null => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  elements.forEach((element) => {
    const bounds = getPresentationElementBounds(element, resolveBounds);
    if (!bounds) return;

    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  });

  if (
    minX === Infinity ||
    minY === Infinity ||
    maxX === -Infinity ||
    maxY === -Infinity
  ) {
    return null;
  }

  return { minX, minY, maxX, maxY };
};
