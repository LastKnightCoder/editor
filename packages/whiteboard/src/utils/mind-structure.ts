import type { MindNodeElement } from "../types/mind";
import { getMindLayout } from "./mind-layout";
import { isSummary } from "./mind-layout/tree-shape";

/** 概要与外框只接受同父、同侧、连续的普通兄弟。 */
export function adjacentMindSiblings(root: MindNodeElement, ids: readonly string[]) {
  if (!ids.length) return null;
  const findParent = (node: MindNodeElement): MindNodeElement | null => {
    if (node.children.some(child => child.id === ids[0])) return node;
    for (const child of node.children) {
      const found = findParent(child);
      if (found) return found;
    }
    return null;
  };
  const parent = findParent(root);
  if (!parent) return null;
  const bothSides = getMindLayout(root).sides.length > 1;
  const picked = parent.children.filter(child => ids.includes(child.id));
  if (picked.length !== new Set(ids).size || picked.some(isSummary)) return null;
  const group = parent.children.filter(
    child => !isSummary(child) && (!bothSides || child.direction === picked[0].direction)
  );
  const indexes = picked.map(child => group.indexOf(child)).sort((a, b) => a - b);
  if (indexes[0] < 0 || indexes.some((index, i) => index !== indexes[0] + i)) return null;
  return { parent, first: group[indexes[0]], last: group[indexes[indexes.length - 1]] };
}
