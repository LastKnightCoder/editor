export interface Point {
  x: number;
  y: number;
}

/**
 * 以某点为锚缩放时的新平移量：锚点下的内容保持不动。
 * 坐标都相对舞台中心，内容以 `translate(pan) scale(zoom)` 摆放、变换原点在中心。
 */
export const panAroundAnchor = (
  pan: Point,
  zoom: number,
  nextZoom: number,
  anchor: Point
): Point => {
  const k = nextZoom / zoom;
  return { x: anchor.x - (anchor.x - pan.x) * k, y: anchor.y - (anchor.y - pan.y) * k };
};

/** 指针事件相对元素中心的坐标 */
export const pointFromCenter = (
  element: HTMLElement,
  event: { clientX: number; clientY: number }
): Point => {
  const rect = element.getBoundingClientRect();
  return {
    x: event.clientX - rect.left - rect.width / 2,
    y: event.clientY - rect.top - rect.height / 2,
  };
};
