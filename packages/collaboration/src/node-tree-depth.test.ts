import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { NodeTree } from "./node-tree";
import { NODE_TREE_LIMITS } from "./model-limits";
import type { ContentNode } from "./protocol";

function chain(tree: NodeTree, prefix: string, length: number) {
  for (let index = 0; index < length; index++)
    tree.insertNode(
      { type: "blockquote", collabId: `${prefix}${index}`, children: [] },
      index ? `${prefix}${index - 1}` : null,
      index ? 0 : tree.read().length,
      "initial",
      true
    );
}
function inspect(nodes: readonly ContentNode[], depth = 0): { ids: string[]; depth: number } {
  let maximum = depth;
  const ids: string[] = [];
  for (const node of nodes) {
    if (typeof node.collabId !== "string") continue;
    ids.push(node.collabId);
    const child = inspect(node.children ?? [], depth + 1);
    ids.push(...child.ids);
    maximum = Math.max(maximum, child.depth);
  }
  return { ids, depth: maximum };
}

describe("逻辑层级预算", () => {
  it("分次插入到边界可读，再插一层在写入前拒绝", () => {
    const tree = new NodeTree(new Y.Doc());
    try {
      chain(tree, "A", NODE_TREE_LIMITS.depth);
      expect(inspect(tree.read()).depth).toBe(NODE_TREE_LIMITS.depth);
      const before = Y.encodeStateAsUpdate(tree.doc);
      expect(() =>
        tree.insertNode(
          { type: "paragraph", children: [] },
          `A${NODE_TREE_LIMITS.depth - 1}`,
          0,
          null
        )
      ).toThrow("层级");
      expect(Y.encodeStateAsUpdate(tree.doc)).toEqual(before);
    } finally {
      tree.doc.destroy();
    }
  });

  it("移动整棵子树计入高度，超限不产生位置或恢复写入", () => {
    const tree = new NodeTree(new Y.Doc());
    try {
      chain(tree, "A", 40);
      chain(tree, "B", 30);
      const before = Y.encodeStateAsUpdate(tree.doc);
      expect(() => tree.moveNode("B0", "A39", 0, null)).toThrow("层级");
      expect(Y.encodeStateAsUpdate(tree.doc)).toEqual(before);
    } finally {
      tree.doc.destroy();
    }
  });

  it("两次各自合法的并发移动合成超深链时，投影恢复且不丢节点或改原数据", () => {
    const base = new NodeTree(new Y.Doc());
    const left = new NodeTree(new Y.Doc()),
      right = new NodeTree(new Y.Doc());
    try {
      chain(base, "A", 30);
      chain(base, "B", 30);
      chain(base, "C", 30);
      const initial = Y.encodeStateAsUpdate(base.doc);
      Y.applyUpdate(left.doc, initial);
      Y.applyUpdate(right.doc, initial);
      left.moveNode("A0", "B29", 0, {});
      right.moveNode("B0", "C29", 0, {});
      const a = Y.encodeStateAsUpdate(left.doc),
        b = Y.encodeStateAsUpdate(right.doc);
      Y.applyUpdate(left.doc, b);
      Y.applyUpdate(right.doc, a);
      const before = Y.encodeStateAsUpdate(left.doc);
      expect(left.read()).toEqual(right.read());
      const visible = inspect(left.read());
      expect(visible.ids).toHaveLength(90);
      expect(new Set(visible.ids).size).toBe(90);
      expect(visible.depth).toBeLessThanOrEqual(NODE_TREE_LIMITS.depth);
      expect(Y.encodeStateAsUpdate(left.doc)).toEqual(before);
    } finally {
      base.doc.destroy();
      left.doc.destroy();
      right.doc.destroy();
    }
  });
});
