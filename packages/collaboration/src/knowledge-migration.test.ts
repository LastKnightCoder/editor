import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createSharedDocument, readSharedContent } from "./document";
import { migrateKnowledgeDocument } from "./knowledge-migration";

describe("知识库协作引用升级", () => {
  it("多端独立转换后合并不会重复正文，并保留房间和内容身份", () => {
    const first = createSharedDocument({
      title: "共享文档",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        {
          type: "paragraph",
          children: [
            {
              type: "content-link",
              contentType: "document-item",
              refId: 2,
              contentId: 20,
              children: [{ text: "原文" }],
            },
          ],
        },
      ],
    });
    const second = new Y.Doc();
    Y.applyUpdate(second, Y.encodeStateAsUpdate(first));
    const mapping = { items: { 2: 6 }, projects: {} };
    expect(migrateKnowledgeDocument(first, mapping)).toBe(true);
    expect(migrateKnowledgeDocument(second, mapping)).toBe(true);
    Y.applyUpdate(first, Y.encodeStateAsUpdate(second));
    const content = readSharedContent(first).content;
    expect(content).toHaveLength(1);
    expect(content[0].children).toHaveLength(1);
    expect(content[0].children?.[0]).toMatchObject({
      contentType: "project-item",
      refId: 6,
      contentId: 20,
      children: [{ type: "formatted", text: "原文" }],
    });
    expect(migrateKnowledgeDocument(first, mapping)).toBe(false);
  });

  it("缺失映射时不部分改动文档或私有节点", () => {
    const doc = createSharedDocument({
      title: "",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        {
          type: "content-link",
          contentType: "document-item",
          refId: 2,
          children: [{ text: "引用" }],
        },
      ],
    });
    const before = Y.encodeStateAsUpdate(doc);
    expect(() => migrateKnowledgeDocument(doc, { items: {}, projects: {} })).toThrow("2");
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  });
});
