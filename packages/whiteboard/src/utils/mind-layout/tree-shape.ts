import type { MindNodeElement, MindRange } from "../../types/mind";

/** 折叠按子节点自己的 direction 读父节点对应侧的标记，与布局无关 */
export const isHiddenChild = (parent: MindNodeElement, child: MindNodeElement) =>
  child.direction === "left" ? Boolean(parent.isLeftFold) : Boolean(parent.isRightFold);

export const visibleChildren = (node: MindNodeElement) =>
  node.children.filter(child => !isHiddenChild(node, child));

/**
 * 层级与方向是数据规范：level 自根计数，三级及以下继承父节点方向。
 * 单向布局所有子节点排成一组，左右折叠标记合一：有子节点的那几侧都收起才算收起，
 * 否则全部展开（从思维导图切过来时根节点可能只收起了一侧）。
 */
export function normalizeTree(root: MindNodeElement, singleSide: boolean) {
  const walk = (node: MindNodeElement, level: number) => {
    node.level = level;
    if (singleSide && node.children.length) {
      const folded = node.children.every(child => isHiddenChild(node, child));
      node.isLeftFold = folded;
      node.isRightFold = folded;
    }
    for (const child of node.children) {
      if (level >= 2) child.direction = node.direction;
      walk(child, level + 1);
    }
  };
  walk(root, 1);
}

export const isSummary = (node: MindNodeElement) => Boolean(node.summaryRange);

/** 参与兄弟排布的子节点：可见且不是概要；概要贴着它括住的区间单独摆放 */
export const stackChildren = (node: MindNodeElement) =>
  visibleChildren(node).filter(child => !isSummary(child));

export const summaryChildren = (node: MindNodeElement) => visibleChildren(node).filter(isSummary);

/**
 * 区间 [startId, endId] 括住的兄弟。siblings 是父节点下的非概要子节点；双向布局里只和起点同侧的兄弟
 * 连成一组（另一侧的兄弟不打断区间）。端点缺失时退化为另一端，都不存在返回空数组。
 */
export function createRangeResolver(siblings: MindNodeElement[], bothSides: boolean) {
  const groups = { left: [] as MindNodeElement[], right: [] as MindNodeElement[] };
  const indexes = new Map<string, { side: "left" | "right"; index: number }>();
  for (const child of siblings) {
    const side = bothSides ? child.direction : "right";
    indexes.set(child.id, { side, index: groups[side].length });
    groups[side].push(child);
  }
  return (range: MindRange): MindNodeElement[] => {
    const start = indexes.get(range.startId),
      end = indexes.get(range.endId);
    const anchor = start ?? end;
    if (!anchor) return [];
    const first = start?.side === anchor.side ? start.index : anchor.index;
    const last = end?.side === anchor.side ? end.index : anchor.index;
    return groups[anchor.side].slice(Math.min(first, last), Math.max(first, last) + 1);
  };
}

export function resolveRange(
  siblings: MindNodeElement[],
  range: MindRange,
  bothSides: boolean
): MindNodeElement[] {
  return createRangeResolver(siblings, bothSides)(range);
}

const rangeChildren = (node: MindNodeElement) => node.children.filter(child => !isSummary(child));

/**
 * 删除 removedIds 前调用：落在区间端点上的删除把端点向区间内收到最近的幸存兄弟，
 * 整段都被删的概要节点加入 removedIds、外框移除。
 */
export function shrinkRangesBeforeRemoval(
  parent: MindNodeElement,
  removedIds: Set<string>,
  bothSides: boolean
) {
  const siblings = rangeChildren(parent);
  const resolve = createRangeResolver(siblings, bothSides);
  const shrink = (range: MindRange): MindRange | null => {
    const kept = resolve(range).filter(child => !removedIds.has(child.id));
    return kept.length ? { startId: kept[0].id, endId: kept[kept.length - 1].id } : null;
  };
  for (const child of parent.children) {
    if (!child.summaryRange || removedIds.has(child.id)) continue;
    const next = shrink(child.summaryRange);
    if (next) child.summaryRange = next;
    else removedIds.add(child.id);
  }
  if (parent.boundaries) {
    const boundaries = parent.boundaries.flatMap(boundary => {
      const next = shrink(boundary);
      return next ? [{ ...boundary, ...next }] : [];
    });
    if (boundaries.length) parent.boundaries = boundaries;
    else delete parent.boundaries;
  }
}

/**
 * 区间数据规范（布局前执行，兜住协作并发删除、跨文档粘贴等端点失效的情况）：
 * 端点失效按 resolveRange 退化；整段失效的外框删掉，概要退回普通子节点（不丢内容）；
 * 概要的方向跟随它括住的兄弟；同区间的并发重复概要保留为普通节点，避免重叠和丢正文。
 */
export function reconcileRanges(root: MindNodeElement, bothSides: boolean) {
  const walk = (node: MindNodeElement) => {
    const siblings = rangeChildren(node);
    const byId = new Map(siblings.map(child => [child.id, child]));
    const resolve = createRangeResolver(siblings, bothSides);
    const normalize = (range: MindRange) => {
      const nodes = resolve(range);
      return nodes.length ? { startId: nodes[0].id, endId: nodes[nodes.length - 1].id } : null;
    };
    const summaries = new Map<string, Set<string>>();
    for (const child of node.children) {
      if (!child.summaryRange) continue;
      const next = normalize(child.summaryRange);
      const ends = next && summaries.get(next.startId);
      if (!next || ends?.has(next.endId)) {
        delete child.summaryRange;
        continue;
      }
      const seen = ends ?? new Set<string>();
      seen.add(next.endId);
      summaries.set(next.startId, seen);
      child.summaryRange = next;
      child.direction = byId.get(next.startId)!.direction;
    }
    if (node.boundaries) {
      const boundaries = node.boundaries.flatMap(boundary => {
        const next = normalize(boundary);
        return next ? [{ ...boundary, ...next }] : [];
      });
      if (boundaries.length) node.boundaries = boundaries;
      else delete node.boundaries;
    }
    node.children.forEach(walk);
  };
  walk(root);
}
