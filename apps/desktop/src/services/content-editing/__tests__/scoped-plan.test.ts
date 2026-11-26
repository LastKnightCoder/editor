import * as Y from "yjs";
import { expect, it } from "vitest";
import type { Descendant } from "slate";
import {
  buildScopedContentUpdate,
  createNodeDocument,
  captureScopedTextEdit,
  NodeTree,
  readDocumentIdentity,
  readNodeDocument,
  validateNodeDocument,
} from "@tau/collaboration";
import { createTestDocument } from "@tau/collaboration/src/testing/node-document";
import { applyEditOperations } from "../edit-engine";
import { compileScopedPlan } from "../scoped-plan";
import { createContentSnapshot, offsetToMarkdownPoint } from "../snapshot";
import type { EditOperation } from "../types";
import { prepareContentContracts } from "@/services/editorKit";
import { getMarkdown } from "@/utils/markdown";

it("完整查询块替换保留参数和视图，并允许无关正文继续输入", async () => {
  const params = { tag: "读书" };
  const presentation = {
    views: [
      {
        id: 1,
        name: "表格",
        type: "table",
        order: 0,
        config: { columnOrder: ["q:title"], rowOrder: [], sorts: [], filters: null, groupBy: null },
      },
    ],
    activeViewId: 1,
  };
  const code = 'TABLE title FROM cards WHERE hasTag("读书")';
  const prepared = await (
    await prepareContentContracts()
  ).createDocument([
    { type: "paragraph", children: [{ type: "formatted", text: "原来的正文" }] },
    {
      type: "query-database",
      id: "query-id",
      language: "dsl",
      code,
      paramsJson: JSON.stringify(params),
      presentationJson: JSON.stringify(presentation),
      children: [{ type: "formatted", text: "" }],
    },
  ]);
  const document = await createNodeDocument(
    { documentId: "query-document", baselineId: "base", epoch: 0 },
    {
      title: "查询示例",
      bannerBg: "",
      bannerPosition: "center",
      content: prepared.content as import("@tau/collaboration").ContentNode[],
    },
    prepared.contracts
  );
  const tree = new NodeTree(document);
  try {
    const original = readNodeDocument(document).content;
    const snapshot = createContentSnapshot(original as Descendant[], "database");
    snapshot.editState = {
      contentId: 1,
      databaseName: "library",
      identity: readDocumentIdentity(document),
      state: Y.encodeStateAsUpdate(document),
    };
    const nextCode = code + "\nLIMIT 10";
    const operations: EditOperation[] = [
      {
        op: "replace",
        locator: { kind: "slate-path", path: [1] },
        text: getMarkdown([{ ...original[1], code: nextCode }] as Descendant[]),
      },
    ];
    const plan = await compileScopedPlan(
      snapshot,
      applyEditOperations({ snapshot, operations, selection: null }).patches,
      operations
    );
    tree.insertText(String(original[0].collabId), 0, "用户新增", null);
    Y.applyUpdate(document, (await buildScopedContentUpdate(document, plan)).update);
    await validateNodeDocument(document);
    const result = readNodeDocument(document).content;
    expect(result[0]).toMatchObject({
      collabId: original[0].collabId,
      children: [{ text: "用户新增原来的正文" }],
    });
    expect(result[1]).toMatchObject({ type: "query-database", language: "dsl", code: nextCode });
    expect(JSON.parse(String(result[1].paramsJson))).toEqual(params);
    expect(JSON.parse(String(result[1].presentationJson))).toEqual(presentation);
  } finally {
    tree.dispose();
    document.destroy();
  }
});

it("把精确 Markdown 替换和全文尾部插入编译成独立范围，保留格式及无关节点", async () => {
  const document = await createTestDocument(
    {
      title: "卡片",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        { type: "paragraph", collabId: "first", children: [{ text: "你好👋正文", bold: true }] },
        { type: "paragraph", collabId: "second", children: [{ text: "保留" }] },
      ],
    },
    { documentId: "card", baselineId: "base", epoch: 0 }
  );
  const tree = new NodeTree(document);
  try {
    const snapshot = createContentSnapshot(
      readNodeDocument(document).content as Descendant[],
      "database"
    );
    snapshot.editState = {
      contentId: 1,
      databaseName: "library",
      identity: readDocumentIdentity(document),
      state: Y.encodeStateAsUpdate(document),
    };
    const point = (index: number) => offsetToMarkdownPoint(index, snapshot.lineOffsets);
    const offset = snapshot.markdown.indexOf("正文");
    const operations: EditOperation[] = [
      {
        op: "replace",
        locator: { kind: "markdown-range", start: point(offset), end: point(offset + 2) },
        text: "文本",
      },
      { op: "insert", locator: { kind: "full-document" }, position: "end", text: "\n\n新增例子" },
    ];
    const plan = await compileScopedPlan(
      snapshot,
      applyEditOperations({ snapshot, operations, selection: null }).patches,
      operations
    );
    expect(plan.edits.map(edit => edit.kind)).toEqual(["text", "blocks"]);
    tree.insertText("second", 0, "用户", null);
    const { update, inverse } = await buildScopedContentUpdate(document, plan);
    Y.applyUpdate(document, update);
    await validateNodeDocument(document);
    expect(readNodeDocument(document).content).toMatchObject([
      { collabId: "first", children: [{ text: "你好👋文本", bold: true }] },
      { collabId: "second", children: [{ text: "用户保留" }] },
      { type: "paragraph", children: [{ text: "新增例子" }] },
    ]);
    tree.insertText("second", 0, "又改", null);
    Y.applyUpdate(document, (await buildScopedContentUpdate(document, inverse!)).update);
    expect(readNodeDocument(document).content).toMatchObject([
      { collabId: "first", children: [{ text: "你好👋正文", bold: true }] },
      { collabId: "second", children: [{ text: "又改用户保留" }] },
    ]);
    await validateNodeDocument(document);
  } finally {
    tree.dispose();
    document.destroy();
  }
});

it("同一个插入点和同批过期目标会拒绝，重读后可以在新正文上修改", async () => {
  const document = await createTestDocument(
    {
      title: "",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        { type: "paragraph", collabId: "first", children: [{ text: "甲👋乙" }] },
        { type: "paragraph", collabId: "second", children: [{ text: "丙丁" }] },
      ],
    },
    { documentId: "card", baselineId: "base", epoch: 0 }
  );
  const tree = new NodeTree(document);
  try {
    expect(() => captureScopedTextEdit(tree, "invalid", "first", 2, 2, "损坏")).toThrow("Unicode");
    const insert = captureScopedTextEdit(tree, "insert", "first", 1, 1, "人");
    const independent = captureScopedTextEdit(tree, "independent", "second", 0, 1, "戊");
    const planned = await buildScopedContentUpdate(document, { edits: [insert] });
    Y.applyUpdate(document, planned.update);
    const saved = Y.encodeStateAsUpdate(document);
    await expect(
      buildScopedContentUpdate(document, { edits: [independent, { ...insert, text: "AI" }] })
    ).rejects.toMatchObject({
      code: "SCOPE_CONFLICT",
      conflicts: [{ opId: "insert", blockId: "first" }],
    });
    expect(Y.encodeStateAsUpdate(document)).toEqual(saved);
    const revised = captureScopedTextEdit(tree, "reread", "first", 1, 2, "用户");
    Y.applyUpdate(
      document,
      (await buildScopedContentUpdate(document, { edits: [revised, independent] })).update
    );
    expect(readNodeDocument(document).content).toMatchObject([
      { collabId: "first", children: [{ text: "甲用户👋乙" }] },
      { collabId: "second", children: [{ text: "戊丁" }] },
    ]);
    await validateNodeDocument(document);
  } finally {
    tree.dispose();
    document.destroy();
  }
});
