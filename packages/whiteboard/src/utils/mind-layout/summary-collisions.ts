import RBush from "rbush";
import type { MindNodeElement } from "../../types/mind";
import type { MindBox, MindLayout } from "./types";
import { createRangeGeometry, placeSummary } from "./ranges";
import { isSummary, visibleChildren } from "./tree-shape";

interface Entry {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  node: MindNodeElement;
}
const GAP = 10;
const entryOf = (node: MindNodeElement): Entry => ({
  minX: node.x,
  minY: node.y,
  maxX: node.x + node.width,
  maxY: node.y + node.height,
  node,
});
const searchBox = (box: MindBox) => ({
  minX: box.x - GAP,
  minY: box.y - GAP,
  maxX: box.x + box.width + GAP,
  maxY: box.y + box.height + GAP,
});

/** 概要子树整体向区间外侧避让，普通分支位置保持原布局规则。 */
export function resolveSummaryCollisions(root: MindNodeElement, layout: MindLayout): void {
  const summaries: Array<{ node: MindNodeElement; parent: MindNodeElement }> = [];
  const nodes: MindNodeElement[] = [];
  const walk = (node: MindNodeElement, parent?: MindNodeElement) => {
    nodes.push(node);
    visibleChildren(node).forEach(child => walk(child, node));
    if (parent && isSummary(node)) summaries.push({ node, parent });
  };
  walk(root);
  if (!summaries.length) return;
  const entries = new Map(nodes.map(node => [node, entryOf(node)]));
  const occupied = new RBush<Entry>().load([...entries.values()]);
  const bothSides = layout.sides.length > 1;
  const geometries = new Map<MindNodeElement, ReturnType<typeof createRangeGeometry>>();
  for (const { node, parent } of summaries) {
    const subtree: MindNodeElement[] = [];
    const collect = (current: MindNodeElement) => {
      subtree.push(current);
      visibleChildren(current).forEach(collect);
    };
    collect(node);
    for (const current of subtree) {
      const entry = entries.get(current);
      if (!entry) throw new Error("概要子树缺少空间索引");
      occupied.remove(entry);
    }
    const axis = layout.siblingAxis(parent.level);
    const side = bothSides ? node.direction : "right";
    const geometry = geometries.get(parent) ?? createRangeGeometry(bothSides);
    geometries.set(parent, geometry);
    const old = { x: node.x, y: node.y };
    placeSummary(parent, node, axis, side, bothSides, geometry);
    const dx = node.x - old.x,
      dy = node.y - old.y;
    for (const child of subtree.slice(1)) {
      child.x += dx;
      child.y += dy;
    }
    const box = geometry.subtreeBox(node);
    let shift = 0;
    let collisions = occupied.search(searchBox(box));
    while (collisions.length) {
      const step =
        axis === "x"
          ? Math.max(...collisions.map(item => item.maxY + GAP + 1 - box.y))
          : side === "left"
            ? Math.min(...collisions.map(item => item.minX - GAP - 1 - box.x - box.width))
            : Math.max(...collisions.map(item => item.maxX + GAP + 1 - box.x));
      shift += step;
      if (axis === "x") box.y += step;
      else box.x += step;
      collisions = occupied.search(searchBox(box));
    }
    for (const current of subtree) {
      if (axis === "x") current.y += shift;
      else current.x += shift;
      const entry = entryOf(current);
      entries.set(current, entry);
      occupied.insert(entry);
    }
  }
  const geometry = createRangeGeometry(bothSides);
  geometry.subtreeBox(root);
  for (const node of nodes)
    node.actualHeight = Math.max(node.actualHeight, geometry.subtreeBox(node).height);
}
