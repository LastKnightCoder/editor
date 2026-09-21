/**
 * 筛选树纯工具：FilterPanel 摘要与 ViewTabs 激活计数共用的口径。
 */

import type { FilterGroup } from "../types";

/** 递归统计组内条件数（嵌套组不计自身） */
export const countFilterConditions = (group: FilterGroup | null | undefined): number => {
  if (!group) return 0;
  return group.children.reduce(
    (total, child) => total + (child.type === "group" ? countFilterConditions(child) : 1),
    0
  );
};
