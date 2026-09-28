import { dirName, isWithin } from "../paths";

export interface TreeEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface TreeRow extends TreeEntry {
  depth: number;
  expanded: boolean;
}

export function sortEntries(entries: TreeEntry[]) {
  return [...entries].sort((a, b) =>
    a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name, "zh-CN") : a.isDirectory ? -1 : 1
  );
}

/** 扫描结果的索引：按父目录分组（已排序）+ 小写名，建一次、每次筛选复用 */
export interface TreeIndex {
  rootPath: string;
  entries: TreeEntry[];
  lowerNames: string[];
  byParent: Map<string, TreeEntry[]>;
}

export function buildTreeIndex(rootPath: string, entries: TreeEntry[]): TreeIndex {
  const byParent = new Map<string, TreeEntry[]>();
  for (const entry of entries) {
    const parent = dirName(entry.path);
    const list = byParent.get(parent);
    if (list) list.push(entry);
    else byParent.set(parent, [entry]);
  }
  for (const [parent, list] of byParent) byParent.set(parent, sortEntries(list));
  return {
    rootPath,
    entries,
    lowerNames: entries.map(entry => entry.name.toLowerCase()),
    byParent,
  };
}

export interface FilterResult {
  rows: TreeRow[];
  /** 行数超过上限被截断 */
  truncated: boolean;
}

/**
 * 按名称筛选（文件与文件夹都参与匹配），O(条目数)：
 * 命中路径上的祖先目录恒展开、只列命中项；自身命中但没有命中后代的文件夹只显示它自己，
 * 沿用文件树展开状态，展开后列出其下全部内容。输出超过 limit 行即截断。
 */
export function filterTree(
  index: TreeIndex,
  query: string,
  expanded: ReadonlySet<string>,
  limit: number
): FilterResult {
  const { rootPath, entries, lowerNames, byParent } = index;
  const needle = query.trim().toLowerCase();
  const keep = new Set<string>();
  entries.forEach((entry, i) => {
    if (!lowerNames[i].includes(needle)) return;
    keep.add(entry.path);
    for (
      let dir = dirName(entry.path);
      isWithin(dir, rootPath) && dir !== rootPath && !keep.has(dir);
      dir = dirName(dir)
    ) {
      keep.add(dir);
    }
  });
  // 目录是否有命中后代：keep 里有以它为父的条目
  const hasKeptChild = new Set<string>();
  for (const path of keep) hasKeptChild.add(dirName(path));

  const rows: TreeRow[] = [];
  let truncated = false;
  const walk = (dir: string, depth: number, unfiltered: boolean) => {
    for (const entry of byParent.get(dir) ?? []) {
      if (!unfiltered && !keep.has(entry.path)) continue;
      if (rows.length >= limit) {
        truncated = true;
        return;
      }
      const onHitPath = !unfiltered && hasKeptChild.has(entry.path);
      const open = entry.isDirectory && (onHitPath || expanded.has(entry.path));
      rows.push({ ...entry, depth, expanded: open });
      if (open) walk(entry.path, depth + 1, !onHitPath);
      if (truncated) return;
    }
  };
  walk(rootPath, 0, false);
  return { rows, truncated };
}
