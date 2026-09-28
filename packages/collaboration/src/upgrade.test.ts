/**
 * 会话升级 / 降级（01 §7.3 第 1 层）：发起共享与结束共享都是就地改同一个 Y.Doc。
 * 取代 P0 的 spike S1。
 */
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createEditor, Transforms } from "slate";
import { withYjs, YjsEditor } from "@slate-yjs/core";
import {
  LOCAL_FIELDS,
  createSharedDocument,
  getBody,
  getFields,
  readSharedContent,
  validateDocument,
} from "./document";
import { collectSharedResources, downgradeSharedDocument, upgradeLocalDocument } from "./upgrade";
import type { ContentNode, SharedContent } from "./protocol";

const SECRET = "机密白板数据-只在本机";
const SECRET_EDITED = "机密白板数据-编辑后";
const LOCAL_IMAGE = "/Users/someone/Pictures/private.png";
const ASSET = "tau-collab-asset:uploaded-id";

const article = (): SharedContent => ({
  title: "升级测试",
  bannerBg: "",
  bannerPosition: "center",
  content: [
    { type: "paragraph", children: [{ text: "开头段落" }] },
    { type: "whiteboard", whiteboardId: 42, snapshot: SECRET, children: [{ text: "" }] },
    {
      type: "code-block",
      code: "console.log(1)",
      language: "js",
      isFold: true,
      children: [{ text: "" }],
    },
    { type: "image", url: LOCAL_IMAGE, children: [{ text: "" }] },
    { type: "paragraph", children: [{ text: "结尾段落" }] },
  ],
});

const local = (value = article()) => {
  const privateNodes = new Map<string, ContentNode>();
  const doc = createSharedDocument(value, undefined, "local");
  return { doc, privateNodes };
};

const encoded = (doc: Y.Doc) => new TextDecoder().decode(Y.encodeStateAsUpdate(doc));
const bodyNodes = (doc: Y.Doc) =>
  (getBody(doc).toDelta() as { insert: Y.XmlText }[]).map(entry => entry.insert);

/** 模拟本机会话里的编辑历史：改正文，并多次改写私有块数据 */
function editLocally(doc: Y.Doc) {
  const editor = withYjs(createEditor(), getBody(doc));
  YjsEditor.connect(editor);
  for (let round = 0; round < 20; round++) {
    Transforms.insertText(editor, `第${round}次`, { at: { path: [0, 0], offset: 0 } });
    Transforms.setNodes(editor, { snapshot: `${SECRET_EDITED}-${round}` } as never, { at: [1] });
    YjsEditor.flushLocalChanges(editor);
  }
  YjsEditor.disconnect(editor);
}

describe("本机会话升级为共享", () => {
  it("非私有块保持同一个 Y.XmlText 实例，私有块换成占位", () => {
    const { doc, privateNodes } = local();
    const before = bodyNodes(doc);

    upgradeLocalDocument(doc, privateNodes);

    const after = bodyNodes(doc);
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(after[4]).toBe(before[4]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[1].getAttribute("type")).toBe("collaboration-placeholder");
    // 本机字段（折叠态）不进共享文档
    expect(after[2].getAttribute("isFold")).toBeUndefined();
    expect(privateNodes.size).toBe(1);
    expect([...privateNodes.values()][0]).toMatchObject({ type: "whiteboard", snapshot: SECRET });
  });

  it("升级结果通过服务端校验，内容与新建共享文档一致", () => {
    const { doc, privateNodes } = local();
    upgradeLocalDocument(doc, privateNodes, new Map([[LOCAL_IMAGE, ASSET]]));

    const fresh = createSharedDocument(article(), new Map());
    const strip = (value: SharedContent) =>
      JSON.parse(JSON.stringify(value), (key, entry) =>
        key === "collabId" ? undefined : key === "url" ? undefined : entry
      );
    expect(strip(readSharedContent(doc))).toEqual(strip(readSharedContent(fresh)));
    expect(() => validateDocument(doc)).not.toThrow();
  });

  it("隐私：带编辑历史升级后，编码状态里没有任何私有块数据与本地路径", () => {
    const { doc, privateNodes } = local();
    editLocally(doc);
    expect(encoded(doc)).toContain(SECRET_EDITED);

    upgradeLocalDocument(doc, privateNodes, new Map([[LOCAL_IMAGE, ASSET]]));

    const state = encoded(doc);
    expect(state).not.toContain(SECRET);
    expect(state).not.toContain(SECRET_EDITED);
    expect(state).not.toContain("whiteboardId");
    expect(state).not.toContain(LOCAL_IMAGE);
  });

  it("隐私：私有块的块字段一并清除", () => {
    const { doc, privateNodes } = local();
    const whiteboard = bodyNodes(doc)[1];
    const collabId = String(whiteboard.getAttribute("collabId"));
    doc.transact(() => getFields(doc).set(collabId, new Y.Map([["code", "私有块的源码字段"]])));

    upgradeLocalDocument(doc, privateNodes);

    expect(getFields(doc).get(collabId)).toBeUndefined();
    expect(encoded(doc)).not.toContain("私有块的源码字段");
  });

  it("嵌套在引用块里的私有块也会换成占位", () => {
    const value = article();
    value.content = [
      {
        type: "blockquote",
        children: [
          { type: "whiteboard", whiteboardId: 7, snapshot: SECRET, children: [{ text: "" }] },
        ],
      },
    ];
    const { doc, privateNodes } = local(value);

    upgradeLocalDocument(doc, privateNodes);

    expect(privateNodes.size).toBe(1);
    expect(encoded(doc)).not.toContain(SECRET);
    expect(() => validateDocument(doc)).not.toThrow();
  });

  it("回滚把文档还原到升级前（发布失败时不留半成品）", () => {
    const { doc, privateNodes } = local();
    const before = JSON.stringify(readSharedContent(doc, privateNodes));

    const rollback = upgradeLocalDocument(doc, privateNodes, new Map([[LOCAL_IMAGE, ASSET]]));
    expect(doc.getMap("meta").get("mode")).toBe("shared");
    rollback();

    expect(doc.getMap("meta").get("mode")).toBe("local");
    expect(privateNodes.size).toBe(0);
    expect(JSON.stringify(readSharedContent(doc, privateNodes))).toBe(before);
  });

  it("关掉 gc 的文档拒绝升级（隐私边界的前提）", () => {
    const doc = new Y.Doc({ gc: false });
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(createSharedDocument(article(), undefined, "local")));
    expect(() => upgradeLocalDocument(doc, new Map())).toThrow(/垃圾回收/);
  });

  it("已经是共享的文档拒绝重复升级", () => {
    const doc = createSharedDocument(article(), new Map());
    expect(() => upgradeLocalDocument(doc, new Map())).toThrow(/本机会话/);
  });

  it("collectSharedResources 收集正文与 banner 的资源，跳过私有块", () => {
    const value = article();
    value.bannerBg = "/Users/someone/banner.jpg";
    (value.content[1] as ContentNode).cover = "/Users/someone/whiteboard-cover.png";
    const { doc, privateNodes } = local(value);

    const references = collectSharedResources(doc, privateNodes);

    expect(references).toContain(LOCAL_IMAGE);
    expect(references).toContain("/Users/someone/banner.jpg");
    expect(references).not.toContain("/Users/someone/whiteboard-cover.png");
  });
});

describe("共享会话降级为本机", () => {
  it("占位换回私有块真身，资源换回本地路径，文档对象不变", () => {
    const { doc, privateNodes } = local();
    upgradeLocalDocument(doc, privateNodes, new Map([[LOCAL_IMAGE, ASSET]]));
    const paragraph = bodyNodes(doc)[0];

    downgradeSharedDocument(doc, privateNodes, new Map([[ASSET, LOCAL_IMAGE]]));

    expect(doc.getMap("meta").get("mode")).toBe("local");
    expect(bodyNodes(doc)[0]).toBe(paragraph);
    const content = readSharedContent(doc).content;
    expect(content[1]).toMatchObject({ type: "whiteboard", snapshot: SECRET });
    expect(content[3]).toMatchObject({ type: "image", url: LOCAL_IMAGE });
  });

  it("升级再降级后内容回到原样（本机字段除外，它是视图状态）", () => {
    const { doc, privateNodes } = local();
    // isFold 等 LOCAL_FIELDS 升级时按设计丢弃、降级不恢复：折叠态是本机视图状态，不是内容
    const withoutLocalFields = () =>
      JSON.stringify(readSharedContent(doc, privateNodes).content, (key, entry) =>
        LOCAL_FIELDS.has(key) ? undefined : entry
      );
    const before = withoutLocalFields();

    upgradeLocalDocument(doc, privateNodes, new Map([[LOCAL_IMAGE, ASSET]]));
    downgradeSharedDocument(doc, privateNodes, new Map([[ASSET, LOCAL_IMAGE]]));

    expect(withoutLocalFields()).toBe(before);
  });
});
