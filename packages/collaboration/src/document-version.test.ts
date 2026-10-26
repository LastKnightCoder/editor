import { expect, it } from "vitest";
import * as Y from "yjs";
import { createTestDocument } from "./testing/node-document";
import {
  collectDocumentResources,
  readDocumentProjection,
  validateStructuredDocument,
} from "./document-adapter";
import { readDocumentIdentity } from "./document-version";
import { NodeTree } from "./node-tree";
import { isSafeResource } from "./resource-policy";

it.each([undefined, 0, 1, 4, "2"])("拒绝文档版本 %s，不创建根或改写输入", async version => {
  const doc = new Y.Doc();
  if (version !== undefined) doc.getMap("meta").set("version", version);
  const before = Y.encodeStateAsUpdate(doc),
    roots = [...doc.share.keys()];
  try {
    expect(() => readDocumentIdentity(doc)).toThrow();
    expect(() => readDocumentProjection(doc)).toThrow();
    expect(() => collectDocumentResources(doc)).toThrow();
    await expect(
      Promise.resolve().then(() => validateStructuredDocument(doc))
    ).rejects.toMatchObject({ code: "UNSUPPORTED_DOCUMENT" });
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    expect([...doc.share.keys()]).toEqual(roots);
  } finally {
    doc.destroy();
  }
});

it("当前正文资源只按契约读取，声明资源的本地路径仍被拒绝", async () => {
  const doc = await createTestDocument(
    {
      title: "资源",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        {
          type: "image",
          collabId: "image",
          url: "https://example.com/a.png",
          unrelated: "/private/value",
          children: [{ text: "" }],
        },
      ],
    },
    { documentId: "doc", baselineId: "base", epoch: 0 },
    [
      {
        type: "image",
        dataVersion: 1,
        kind: "block",
        isVoid: true,
        resources: [{ path: "url", kind: "image" }],
      },
    ]
  );
  const tree = new NodeTree(doc);
  try {
    expect(collectDocumentResources(doc)).toEqual(["https://example.com/a.png"]);
    expect(readDocumentProjection(doc)).toMatchObject({
      content: [{ unrelated: "/private/value" }],
    });
    tree.setProperties("image", { url: "file:///private/image.png" }, "test");
    await expect(validateStructuredDocument(doc)).rejects.toThrow();
  } finally {
    tree.dispose();
    doc.destroy();
  }
});

it("仅本机资源仍使用不透明身份，不允许在前缀后夹带本地路径", () => {
  expect(isSafeResource("tau-collab-local:0b5c6a3e-1f2d-4c5b-9a8e-7d6c5b4a3f21")).toBe(true);
  expect(isSafeResource("tau-collab-local:/Users/me/clip.mp4")).toBe(false);
});
