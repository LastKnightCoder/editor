import { expect, it } from "vitest";
import * as Y from "yjs";
import { createTestDocument } from "./testing/node-document";
import { NodeTree } from "./node-tree";
import { buildScopedContentUpdate } from "./scoped-content-edit";
import { validateNodeDocument } from "./node-document";
import { canReconcileScopedBlocks } from "./scoped-content-reconcile";
import type { ContentNode } from "./protocol";

const childrenOf = (node: ContentNode) => {
  if (!node.children) throw new Error("测试节点缺少子树");
  return node.children;
};

async function fixture() {
  const document = await createTestDocument(
    {
      title: "",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        {
          type: "table",
          collabId: "table",
          future: { retained: true },
          children: [
            {
              type: "table-row",
              collabId: "r1",
              color: "blue",
              children: [
                {
                  type: "table-cell",
                  collabId: "c1",
                  colSpan: 2,
                  children: [{ text: "甲", bold: true }],
                },
              ],
            },
            {
              type: "table-row",
              collabId: "r2",
              color: "green",
              children: [{ type: "table-cell", collabId: "c2", children: [{ text: "乙" }] }],
            },
          ],
        },
        { type: "paragraph", collabId: "tail", children: [{ text: "无关正文" }] },
      ],
    },
    { documentId: "native", baselineId: "base", epoch: 0 },
    ["paragraph", "table", "table-row", "table-cell"].map(type => ({
      type,
      dataVersion: 1,
      kind: "block" as const,
    }))
  );
  return { document, tree: new NodeTree(document) };
}

it("原生属性、同父级排序和文字更新保持身份，撤销保留范围外输入", async () => {
  const { document, tree } = await fixture();
  try {
    const original = tree.read();
    const before = [original[0]] as (ContentNode & { collabId: string })[];
    const next = structuredClone(before);
    const rows = childrenOf(next[0]);
    rows[0].color = "red";
    childrenOf(rows[0])[0].children = [{ type: "formatted", text: "修改", bold: true }];
    rows.reverse();
    expect(canReconcileScopedBlocks(before, next)).toBe(true);
    const { update, inverse } = await buildScopedContentUpdate(document, {
      edits: [
        {
          kind: "blocks",
          id: "native",
          left: null,
          right: "tail",
          expected: before,
          nodes: next,
          reconcile: true,
        },
      ],
    });
    tree.insertText("tail", 0, "用户", null);
    Y.applyUpdate(document, update);
    await validateNodeDocument(document);
    expect(tree.read()[0]).toEqual(next[0]);
    expect(tree.read()[1]).toMatchObject({
      collabId: "tail",
      children: [{ text: "用户无关正文" }],
    });
    if (!inverse) throw new Error("缺少属性修改的逆操作");
    Y.applyUpdate(
      document,
      (await buildScopedContentUpdate(document, inverse, { undo: true })).update
    );
    await validateNodeDocument(document);
    expect(tree.read()[0]).toEqual(original[0]);
    expect(tree.read()[1]).toMatchObject({
      collabId: "tail",
      children: [{ text: "用户无关正文" }],
    });
  } finally {
    tree.dispose();
    document.destroy();
  }
});

it("清除属性和清空文字不保留旧值，空文本格式可恢复", async () => {
  const { document, tree } = await fixture();
  try {
    const before = [tree.read()[0]] as (ContentNode & { collabId: string })[];
    const next = structuredClone(before);
    const row = childrenOf(next[0])[0];
    delete row.color;
    childrenOf(row)[0].children = [{ type: "formatted", text: "", italic: true }];
    const { update, inverse } = await buildScopedContentUpdate(document, {
      edits: [
        {
          kind: "blocks",
          id: "clear",
          left: null,
          right: "tail",
          expected: before,
          nodes: next,
          reconcile: true,
        },
      ],
    });
    Y.applyUpdate(document, update);
    expect(tree.read()[0]).toEqual(next[0]);
    if (!inverse) throw new Error("缺少逆操作");
    Y.applyUpdate(
      document,
      (await buildScopedContentUpdate(document, inverse, { undo: true })).update
    );
    expect(tree.read()[0]).toEqual(before[0]);
  } finally {
    tree.dispose();
    document.destroy();
  }
});

it("拒绝借原生属性更新更换身份或覆盖已经变化的目标", async () => {
  const { document, tree } = await fixture();
  try {
    const expected = [tree.read()[0]] as (ContentNode & { collabId: string })[];
    const invalid = structuredClone(expected);
    childrenOf(invalid[0])[0].collabId = "other";
    const before = Y.encodeStateAsUpdate(document);
    await expect(
      buildScopedContentUpdate(document, {
        edits: [
          {
            kind: "blocks",
            id: "invalid",
            left: null,
            right: "tail",
            expected,
            nodes: invalid,
            reconcile: true,
          },
        ],
      })
    ).rejects.toMatchObject({ code: "INVALID_OPERATION" });
    expect(Y.encodeStateAsUpdate(document)).toEqual(before);
    const next = structuredClone(expected);
    childrenOf(next[0])[0].color = "red";
    tree.setProperties("r1", { color: "purple" }, null);
    await expect(
      buildScopedContentUpdate(document, {
        edits: [
          {
            kind: "blocks",
            id: "stale",
            left: null,
            right: "tail",
            expected,
            nodes: next,
            reconcile: true,
          },
        ],
      })
    ).rejects.toMatchObject({ code: "SCOPE_CONFLICT" });
    expect(tree.nodeSnapshot("r1").color).toBe("purple");
  } finally {
    tree.dispose();
    document.destroy();
  }
});
