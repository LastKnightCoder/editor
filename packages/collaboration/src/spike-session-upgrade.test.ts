/**
 * 【Spike S1，不是产品代码】验证「发起共享 = 升级本机会话、复用同一个 Y.Doc」是否可行。
 * 见 docs/editor-refactor/02-阶段计划.md P0 与 01 §7.3。结论写入 04 执行日志后，
 * 本文件在 P7 由正式实现的测试取代并删除。
 *
 * 要验证的三件事：
 *  1. 升级走最小编辑：私有块就地换成占位、LOCAL_FIELDS 删除、meta.mode 切到 shared；
 *     与私有块无关的块保持同一个 Y.XmlText 实例（渲染端不会整体重挂载）。
 *  2. 隐私边界：升级后编码出的状态里不包含私有块数据，包括升级前已经编辑过的历史。
 *  3. 体积：带编辑历史的本机会话升级后，编码体积与新建共享文档相比是否可接受。
 */
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createEditor, Transforms } from "slate";
import { withYjs, YjsEditor } from "@slate-yjs/core";
import {
  LOCAL_FIELDS,
  PRIVATE_BLOCKS,
  createSharedDocument,
  getBody,
  readSharedContent,
  validateDocument,
} from "./document";
import type { ContentNode, SharedContent } from "./protocol";

const SECRET = "机密白板数据-只在本机";
const SECRET_EDITED = "机密白板数据-编辑后";

const article = (): SharedContent => ({
  title: "升级测试",
  bannerBg: "",
  bannerPosition: "center",
  content: [
    { type: "paragraph", children: [{ text: "开头段落" }] },
    {
      type: "whiteboard",
      whiteboardId: 42,
      snapshot: SECRET,
      children: [{ text: "" }],
    },
    {
      type: "code-block",
      code: "console.log(1)",
      language: "js",
      isFold: true,
      children: [{ text: "" }],
    },
    { type: "paragraph", children: [{ text: "结尾段落" }] },
  ],
});

/**
 * 就地升级的最小实现：遍历正文顶层（spike 只处理顶层，嵌套私有块的递归留给正式实现），
 * 私有块换成占位并把原数据移到 privateNodes；其余块只删除 LOCAL_FIELDS 属性。
 */
function upgradeInPlace(doc: Y.Doc, privateNodes: Map<string, ContentNode>) {
  const body = getBody(doc);
  doc.transact(() => {
    const delta = body.toDelta() as { insert: unknown }[];
    delta.forEach((entry, index) => {
      if (!(entry.insert instanceof Y.XmlText)) return;
      const element = entry.insert;
      const attributes = element.getAttributes() as Record<string, unknown>;
      const type = String(attributes.type || "");
      if (PRIVATE_BLOCKS.has(type)) {
        const collabId = String(attributes.collabId);
        privateNodes.set(collabId, {
          ...(attributes as ContentNode),
          children: [{ type: "formatted", text: "" }],
        });
        const placeholder = new Y.XmlText();
        placeholder.setAttribute("type", "collaboration-placeholder");
        placeholder.setAttribute("collabId", collabId);
        placeholder.setAttribute("label", type);
        placeholder.insert(0, "", { type: "formatted" });
        body.delete(index, 1);
        body.insertEmbed(index, placeholder);
        return;
      }
      for (const key of Object.keys(attributes))
        if (LOCAL_FIELDS.has(key)) element.removeAttribute(key);
    });
    doc.getMap("meta").set("mode", "shared");
  });
}

/** 模拟本机会话里的一段编辑历史：用编辑器改正文，并多次改写私有块数据 */
function editLocally(doc: Y.Doc) {
  const editor = withYjs(createEditor(), getBody(doc));
  YjsEditor.connect(editor);
  for (let round = 0; round < 50; round++) {
    Transforms.insertText(editor, `第${round}次`, { at: { path: [0, 0], offset: 0 } });
    Transforms.setNodes(editor, { snapshot: `${SECRET_EDITED}-${round}` } as Partial<ContentNode>, {
      at: [1],
    });
    YjsEditor.flushLocalChanges(editor);
  }
  YjsEditor.disconnect(editor);
}

const encodedText = (doc: Y.Doc) => new TextDecoder().decode(Y.encodeStateAsUpdate(doc));

describe("Spike S1：本机会话就地升级为共享", () => {
  it("非私有块保持同一个 Y.XmlText 实例，私有块换成占位", () => {
    const doc = createSharedDocument(article(), undefined, "local");
    const before = (getBody(doc).toDelta() as { insert: Y.XmlText }[]).map(entry => entry.insert);

    upgradeInPlace(doc, new Map());

    const after = (getBody(doc).toDelta() as { insert: Y.XmlText }[]).map(entry => entry.insert);
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(after[3]).toBe(before[3]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[1].getAttribute("type")).toBe("collaboration-placeholder");
    expect(after[2].getAttribute("isFold")).toBeUndefined();
  });

  it("升级结果与新建共享文档读出的内容一致，并能通过服务端校验", () => {
    const upgraded = createSharedDocument(article(), undefined, "local");
    const upgradedPrivate = new Map<string, ContentNode>();
    upgradeInPlace(upgraded, upgradedPrivate);

    const fresh = createSharedDocument(article(), new Map());
    const strip = (value: SharedContent) =>
      JSON.parse(JSON.stringify(value), (key, entry) => (key === "collabId" ? undefined : entry));

    expect(strip(readSharedContent(upgraded))).toEqual(strip(readSharedContent(fresh)));
    expect(() => validateDocument(upgraded)).not.toThrow();
    expect(upgradedPrivate.size).toBe(1);
  });

  it("隐私：带编辑历史升级后，编码状态里没有任何私有块数据", () => {
    const doc = createSharedDocument(article(), undefined, "local");
    editLocally(doc);
    expect(encodedText(doc)).toContain(SECRET_EDITED);

    upgradeInPlace(doc, new Map());

    const encoded = encodedText(doc);
    expect(encoded).not.toContain(SECRET);
    expect(encoded).not.toContain(SECRET_EDITED);
    expect(encoded).not.toContain("whiteboardId");
  });

  it("隐私：本地资源路径就地改写为 asset 引用后，编码状态里没有原路径", () => {
    const LOCAL_PATH = "/Users/someone/Pictures/private-photo.png";
    const value = article();
    value.content.splice(1, 0, { type: "image", url: LOCAL_PATH, children: [{ text: "" }] });
    const doc = createSharedDocument(value, undefined, "local");
    const image = (getBody(doc).toDelta() as { insert: Y.XmlText }[])[1].insert;
    expect(encodedText(doc)).toContain(LOCAL_PATH);

    doc.transact(() => image.setAttribute("url", "tau-collab-asset:uploaded-id"));
    upgradeInPlace(doc, new Map());

    expect(encodedText(doc)).not.toContain(LOCAL_PATH);
    expect(() => validateDocument(doc)).not.toThrow();
  });

  it("隐私：gc 关闭时历史会残留（证明 gc 是这条边界的前提）", () => {
    const doc = new Y.Doc({ gc: false });
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(createSharedDocument(article(), undefined, "local")));
    editLocally(doc);
    upgradeInPlace(doc, new Map());
    expect(encodedText(doc)).toContain(SECRET);
  });

  it("体积：带 50 轮编辑历史的升级文档与新建文档的编码大小", () => {
    const doc = createSharedDocument(article(), undefined, "local");
    editLocally(doc);
    upgradeInPlace(doc, new Map());
    const upgradedBytes = Y.encodeStateAsUpdate(doc).byteLength;
    const freshBytes = Y.encodeStateAsUpdate(
      createSharedDocument(readSharedContent(doc), new Map())
    ).byteLength;
    console.log(`[spike S1] 升级文档 ${upgradedBytes} B，新建文档 ${freshBytes} B`);
    expect(upgradedBytes).toBeLessThan(freshBytes * 20);
  });
});
