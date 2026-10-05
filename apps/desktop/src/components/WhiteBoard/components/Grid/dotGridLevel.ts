/** 屏幕点距下限（px）：低于它点阵会糊成灰面，于是把点距翻倍 */
export const MIN_SCREEN_DOT_GAP = 10;

/**
 * 点阵细节层级：返回当前要画的次级点距（世界坐标，gridSize × 2^k，屏幕点距落在 [10, 20) px）
 * 与次级点透明度（屏幕点距 10→20px 线性 0→1）。主点间距恒为 step × 2，
 * 所以翻倍那一刻旧的次级点正好是新的主点、新的次级点从透明开始，视觉连续。
 */
export function getDotGridLevel(gridSize: number, zoom: number) {
  let step = gridSize;
  while (step * zoom < MIN_SCREEN_DOT_GAP) step *= 2;
  const screenGap = step * zoom;
  const minorOpacity = Math.min(1, (screenGap - MIN_SCREEN_DOT_GAP) / MIN_SCREEN_DOT_GAP);
  return { step, minorOpacity };
}
