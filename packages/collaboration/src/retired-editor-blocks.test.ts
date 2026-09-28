import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { slateNodesToInsertDelta } from "@slate-yjs/core";
import type { Descendant } from "slate";
import cases from "../../db-schema/fixtures/editor-block-retirement.json";
import { stripRetiredEditorBlocks } from "@tau/db-schema";
import {
  getBody,
  getFields,
  guardRetiredEditorBlocks,
  readSharedContent,
  retireEditorBlocksInDoc,
} from "./document";
import type { ContentNode } from "./protocol";

describe("退役编辑器节点", () => {
  it.each(cases)("$name", ({ input, expected, removed }) => {
    const original = structuredClone(input);
    const result = stripRetiredEditorBlocks(input);
    expect(result.value).toEqual(expected);
    expect(result.removed).toBe(removed);
    expect(input).toEqual(original);
    expect(stripRetiredEditorBlocks(result.value).changed).toBe(false);
    if (!removed) expect(result.value).toBe(input);
  });

  function legacy() {
    const doc = new Y.Doc();
    getBody(doc).applyDelta(
      slateNodesToInsertDelta([
        { type: "question", collabId: "q", children: [{ text: "" }] },
        { type: "paragraph", collabId: "kept", children: [{ text: "保留" }] },
        {
          type: "collaboration-placeholder",
          label: "question",
          collabId: "private",
          children: [{ text: "" }],
        },
      ] as unknown as Descendant[])
    );
    return doc;
  }
  it("原位删除、备份先行，多端合并不重复正文", () => {
    const first = legacy();
    const second = new Y.Doc();
    Y.applyUpdate(second, Y.encodeStateAsUpdate(first));
    const kept = getBody(first).toDelta()[1].insert;
    const before = vi.fn();
    expect(retireEditorBlocksInDoc(first, undefined, before)).toBe(true);
    retireEditorBlocksInDoc(second);
    Y.applyUpdate(first, Y.encodeStateAsUpdate(second));
    expect(getBody(first).toDelta()[0].insert).toBe(kept);
    expect(readSharedContent(first).content).toHaveLength(1);
    expect(before).toHaveBeenCalledOnce();
    expect(retireEditorBlocksInDoc(first, undefined, before)).toBe(false);
    first.destroy();
    second.destroy();
  });
  it("备份失败不改文档，清理私有缓存和字段", () => {
    const doc = legacy();
    const snapshot = Y.encodeStateAsUpdate(doc);
    expect(() =>
      retireEditorBlocksInDoc(doc, undefined, () => {
        throw Error("备份失败");
      })
    ).toThrow();
    expect(Y.encodeStateAsUpdate(doc)).toEqual(snapshot);
    const nodes = new Map<string, ContentNode>([["private", { type: "question", children: [] }]]);
    getFields(doc).set("private", new Y.Map());
    retireEditorBlocksInDoc(doc, nodes);
    expect(nodes.size).toBe(0);
    expect(getFields(doc).has("private")).toBe(false);
    doc.destroy();
  });
  it("接收旧端更新后继续清理，全空正文可编辑", () => {
    const doc = new Y.Doc();
    guardRetiredEditorBlocks(doc);
    getBody(doc).applyDelta(
      slateNodesToInsertDelta([
        { type: "chat-reference", children: [{ text: "" }] },
      ] as unknown as Descendant[])
    );
    expect(getBody(doc).length).toBe(0);
    expect(readSharedContent(doc).content).toEqual([
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
    ]);
    doc.destroy();
  });
  it("字段索引出现异常标量时仍可继续清理正文", () => {
    const doc = legacy();
    // 故意写入不符合字段索引类型的旧数据标量
    (getFields(doc) as Y.Map<unknown>).set("malformed", "legacy-value");
    expect(() => retireEditorBlocksInDoc(doc)).not.toThrow();
    expect(getFields(doc).get("malformed")).toBe("legacy-value");
    expect(readSharedContent(doc).content).toHaveLength(1);
    doc.destroy();
  });
});
