// Tab 根顺序契约：AppDock 的展示顺序与 tab 滑动手势的"下一个/上一个"语义
// 共用这一份常量，避免两处顺序漂移。home 为 rootKey（rootContent 直渲）。

export const TAB_ORDER = ["home", "cardsLibrary", "diaryHome", "settings"] as const;

export type TabKey = (typeof TAB_ORDER)[number];

export const TAB_KEYS: ReadonlySet<string> = new Set<string>(TAB_ORDER);

/**
 * 相邻 tab：direction 为 1 表示下一个（从右向左滑），-1 表示上一个（从左向右滑）。
 * 边界 tab 无邻居时返回 null（手势不激活）。
 */
export function resolveTabNeighbor(key: string, direction: 1 | -1): string | null {
  const index = TAB_ORDER.indexOf(key as TabKey);
  if (index < 0) return null;
  const next = TAB_ORDER[index + direction];
  return next ?? null;
}

export function isTabRoot(key: string): boolean {
  return TAB_KEYS.has(key);
}
