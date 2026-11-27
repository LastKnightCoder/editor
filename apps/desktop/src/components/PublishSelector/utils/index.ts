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
