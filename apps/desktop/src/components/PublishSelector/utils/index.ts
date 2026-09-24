export * from "./treeBuilder";
export * from "./scopeCodec";

/**
 * 按选择状态过滤判断
 */
export function matchesSelectionFilter(
  filter: "all" | "selected" | "unselected",
  selected: boolean
): boolean {
  if (filter === "selected") return selected;
  if (filter === "unselected") return !selected;
  return true;
}

/**
 * 选择状态过滤下的空态文案前缀（已选 / 未选）
 */
export function selectionFilterLabel(filter: "all" | "selected" | "unselected"): string {
  return filter === "selected" ? "已选" : filter === "unselected" ? "未选" : "";
}

/**
 * 格式化日期
 */
export function formatDate(timestamp?: number): string {
  if (!timestamp) return "";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "";
  }
}
