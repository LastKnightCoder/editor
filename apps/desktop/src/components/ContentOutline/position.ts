interface HeaderRect {
  top: number;
  bottom: number;
}

/** 优先复用上次位置，只在跨越多节时二分，避免逐个测量屏幕外标题。 */
export function locateOutlineHeader(
  count: number,
  readRect: (index: number) => HeaderRect,
  viewportTop: number,
  viewportBottom: number,
  previous: number
): { active: number; next: number } {
  if (!count) return { active: -1, next: 0 };
  const rects = new Map<number, HeaderRect>();
  const rect = (index: number) => {
    let value = rects.get(index);
    if (!value) {
      value = readRect(index);
      rects.set(index, value);
    }
    return value;
  };
  const above = (index: number) => rect(index).bottom <= viewportTop;
  let next = Math.min(Math.max(previous, 0), count - 1);
  if (!above(next) && (next === 0 || above(next - 1))) {
    // 仍在同一节，邻近标题即可确定位置。
  } else if (above(next) && (next + 1 === count || !above(next + 1))) {
    next += 1;
  } else {
    let low = 0;
    let high = count;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (above(middle)) low = middle + 1;
      else high = middle;
    }
    next = low;
  }
  const active = next < count && rect(next).top < viewportBottom ? next : next - 1;
  return { active, next };
}
