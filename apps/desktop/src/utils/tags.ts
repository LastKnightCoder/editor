/**
 * 标签列表的纯函数：主进程批量改名 / 删除与渲染端选择器共用。
 * hierarchical：卡片标签按 `a/b` 分层，改名或删除父级时子标签一起处理；文章标签按整串匹配。
 */

export interface TagCount {
  tag: string;
  count: number;
  /** 带这个标签的条目里最近一次更新的时间（ms），选择器的「最近用过」按它排 */
  lastUsedAt: number;
}

export interface TagScopeOptions {
  hierarchical: boolean;
}

const covers = (tag: string, target: string, { hierarchical }: TagScopeOptions) =>
  tag === target || (hierarchical && tag.startsWith(target + "/"));

/** 按使用次数降序（同数按名称）汇总标签 */
export function countTags(items: { tags: string[]; usedAt: number }[]): TagCount[] {
  const counts = new Map<string, TagCount>();
  for (const { tags, usedAt } of items) {
    for (const tag of new Set(tags)) {
      const entry = counts.get(tag) ?? { tag, count: 0, lastUsedAt: 0 };
      entry.count += 1;
      entry.lastUsedAt = Math.max(entry.lastUsedAt, usedAt);
      counts.set(tag, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** 把 from（及分层时的子标签）改成 to；改名后撞上已有标签即合并去重，保留首次出现的位置 */
export function renameTagInList(
  tags: string[],
  from: string,
  to: string,
  options: TagScopeOptions
): string[] {
  const renamed = tags.map(tag => (covers(tag, from, options) ? to + tag.slice(from.length) : tag));
  return [...new Set(renamed)];
}

/** 摘掉 tag（分层时连同子标签） */
export function removeTagFromList(tags: string[], tag: string, options: TagScopeOptions): string[] {
  return tags.filter(item => !covers(item, tag, options));
}

export function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

/** 选择器候选：按名称子串（不分大小写）匹配，排除已加上的标签 */
export function matchTagSuggestions(
  suggestions: TagCount[],
  query: string,
  exclude: string[]
): TagCount[] {
  const needle = query.trim().toLowerCase();
  return suggestions.filter(
    ({ tag }) => !exclude.includes(tag) && (!needle || tag.toLowerCase().includes(needle))
  );
}
