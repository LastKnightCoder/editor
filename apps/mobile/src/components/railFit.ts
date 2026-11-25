// 左导航条自选段能露出几格：只按可用高度算，顺序由功能入口清单决定。

/** 导航条一格（图标 30 + 间距 4 + 文字 14）与格间距，自选段按它算能放几个 */
const RAIL_ITEM_HEIGHT = 48;
const RAIL_GAP = 10;

export type RailFit = { count: number; more: boolean };

/** 能放几格：全放得下就全放；否则留一格给「更多」；连「更多」都放不下就整段不显示 */
export function fitRailPins(available: number, total: number): RailFit {
  const capacity = Math.floor((available + RAIL_GAP) / (RAIL_ITEM_HEIGHT + RAIL_GAP));
  if (capacity >= total) return { count: total, more: false };
  if (capacity < 1) return { count: 0, more: false };
  return { count: capacity - 1, more: true };
}
