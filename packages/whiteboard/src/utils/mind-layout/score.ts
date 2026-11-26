/** 拖拽候选按屏幕距离评分，≤ 1 视为在吸附范围内；与缩放无关 */
const HORIZONTAL_PX = 120;
const VERTICAL_PX = 80;

export const scoreOf = (horizontal: number, vertical: number, zoom: number) => {
  const safeZoom = Math.max(zoom, 0.01);
  return Math.hypot((horizontal * safeZoom) / HORIZONTAL_PX, (vertical * safeZoom) / VERTICAL_PX);
};
