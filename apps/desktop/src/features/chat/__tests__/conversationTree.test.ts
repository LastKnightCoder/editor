/**
 * 树谱排版（M4-d）：直链压成一行、分叉按「当前路径在前、其余按最近活动」排、分支数与分叉点、
 * 分支末端的进度。
 */
import { describe, expect, it } from "vitest";
import type { ConversationTreeNode } from "@/types/pi-session";
import { layoutConversationTree } from "../conversationTree";

const node = (
  id: string,
  parentId: string | null,
  time: number,
  patch: Partial<ConversationTreeNode> = {}
): ConversationTreeNode => ({
  id,
  parentId,
  text: id,
  answered: true,
  time,
  onPath: false,
  omitted: false,
  ...patch,
});

describe("layoutConversationTree", () => {
  it("没有分叉：整条对话压成一行，1 条分支，没有分叉点", () => {
    const { rows, branchCount, forkPoints } = layoutConversationTree([
      node("a", null, 1, { onPath: true }),
      node("b", "a", 2, { onPath: true }),
      node("c", "b", 3, { onPath: true }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ length: 3, isLeaf: true, onPath: true, depth: 0 });
    expect(rows[0].tail.id).toBe("c");
    expect(branchCount).toBe(1);
    expect(forkPoints.size).toBe(0);
  });

  it("在第二问后分叉：公共前缀一行，两条分支缩进一层；当前路径的分支在前", () => {
    const { rows, branchCount, forkPoints } = layoutConversationTree([
      node("a", null, 1, { onPath: true }),
      node("b", "a", 2, { onPath: true }),
      node("old", "b", 3),
      node("old2", "old", 9),
      node("new", "b", 5, { onPath: true }),
    ]);
    expect(rows.map(row => [row.node.id, row.depth, row.length])).toEqual([
      ["a", 0, 2],
      ["new", 1, 1],
      ["old", 1, 2],
    ]);
    expect(branchCount).toBe(2);
    expect([...forkPoints]).toEqual(["b"]);
    // 分支进度：旧分支从分叉处起问了 2 轮，最后活动在它的第二问
    const old = rows.find(row => row.node.id === "old")!;
    expect(old).toMatchObject({ isLeaf: true, turnsToLeaf: 2, lastActive: 9, isBranch: true });
  });

  it("不在当前路径上的兄弟按最后活动时间倒序；根上的多个版本也是分支", () => {
    const { rows, branchCount } = layoutConversationTree([
      node("r1", null, 1),
      node("r2", null, 2, { onPath: true }),
      node("r3", null, 3),
      node("r1-next", "r1", 10),
    ]);
    expect(rows.map(row => row.node.id)).toEqual(["r2", "r1", "r3"]);
    expect(rows.every(row => row.depth === 1 && row.isBranch)).toBe(true);
    expect(branchCount).toBe(3);
  });

  it("嵌套分叉：分支里再分叉，层级继续加深", () => {
    const { rows, branchCount, forkPoints } = layoutConversationTree([
      node("a", null, 1, { onPath: true }),
      node("x", "a", 2, { onPath: true }),
      node("y", "a", 3),
      node("x1", "x", 4, { onPath: true }),
      node("x2", "x", 5),
    ]);
    expect(rows.map(row => [row.node.id, row.depth])).toEqual([
      ["a", 0],
      ["x", 1],
      ["x1", 2],
      ["x2", 2],
      ["y", 1],
    ]);
    expect(branchCount).toBe(3);
    expect([...forkPoints].sort()).toEqual(["a", "x"]);
  });

  it("空对话", () => {
    expect(layoutConversationTree([])).toMatchObject({ rows: [], branchCount: 0 });
  });
});
