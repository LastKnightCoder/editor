import type { MindNodeElement } from "../../types/mind";

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
