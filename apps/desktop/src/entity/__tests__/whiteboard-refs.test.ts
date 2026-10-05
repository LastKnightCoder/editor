import { describe, expect, it } from "vitest";
import { extractWhiteboardEmbeds, extractWhiteboardRefs } from "../whiteboard-refs";

const link = (contentType: string, refId: number, contentId?: number) => ({
  type: "content-link",
  contentType,
  refId,
  contentId,
  contentTitle: "标题",
  children: [{ text: "" }],
});

describe("extractWhiteboardRefs", () => {
  it("按元素类型取卡片、文本块、思维导图深层节点关联的笔记", () => {
    const data = {
      children: [
        { id: "a", type: "card", cardId: 12 },
        { id: "b", type: "richtext", contentId: 30, linkedCardId: 13, linkedArticleId: 4 },
        {
          id: "c",
          type: "mind-node",
          contentId: 40,
          text: [{ type: "paragraph", children: [{ text: "根" }] }],
          children: [
            {
              id: "d",
              type: "mind-node",
              text: [],
              children: [{ id: "e", type: "mind-node", contentId: 41, text: [], children: [] }],
            },
          ],
        },
        { id: "f", type: "frame", children: [{ id: "g", type: "card", cardId: 14 }] },
      ],
    };
    expect(extractWhiteboardRefs(data)).toEqual([
      { dstKind: "card", dstId: 12, via: "card" },
      { dstKind: "content", dstId: 30, via: "richtext" },
      { dstKind: "card", dstId: 13, via: "richtext" },
      { dstKind: "article", dstId: 4, via: "richtext" },
      { dstKind: "content", dstId: 40, via: "mind-node" },
      { dstKind: "content", dstId: 41, via: "mind-node" },
      { dstKind: "card", dstId: 14, via: "card" },
    ]);
  });

  it("思维导图节点文字里的内联引用记为 inline；Slate 里 content-link 的 contentId 不当作放入", () => {
    const data = JSON.stringify({
      children: [
        {
          id: "m",
          type: "mind-node",
          text: [{ type: "paragraph", children: [link("card", 7, 70)] }],
          children: [],
        },
        {
          id: "r",
          type: "richtext",
          content: [{ type: "paragraph", children: [link("article", 8, 80)] }],
        },
      ],
    });
    expect(extractWhiteboardRefs(data)).toEqual([
      { dstKind: "card", dstId: 7, via: "inline" },
      { dstKind: "content", dstId: 70, via: "inline" },
    ]);
  });

  it("按约定带 entityRef 的元素无需改解析即可识别；不认识的 kind 忽略", () => {
    expect(
      extractWhiteboardRefs({
        children: [
          { id: "a", type: "article-embed", entityRef: { kind: "article", id: 8 } },
          { id: "p", type: "doc-card", entityRef: { kind: "project_item", id: 9 } },
          { id: "x", type: "pdf", entityRef: { kind: "pdf", id: 1 } },
        ],
      })
    ).toEqual([
      { dstKind: "article", dstId: 8, via: "entity" },
      { dstKind: "project-item", dstId: 9, via: "entity" },
    ]);
  });

  it("无效数据、重复与非法 id 被忽略", () => {
    expect(extractWhiteboardRefs("{坏的")).toEqual([]);
    expect(extractWhiteboardRefs(null)).toEqual([]);
    expect(
      extractWhiteboardRefs({
        children: [
          { type: "card", cardId: 3 },
          { type: "card", cardId: 3 },
          { type: "card", cardId: "x" },
          { type: "richtext", contentId: 0 },
        ],
      })
    ).toEqual([{ dstKind: "card", dstId: 3, via: "card" }]);
  });
});

describe("extractWhiteboardEmbeds", () => {
  it("取文档里嵌入的白板块指向的页", () => {
    const content = [
      { type: "paragraph", children: [{ text: "a" }] },
      { type: "whiteboard", whiteBoardContentId: 5, children: [{ text: "" }] },
      {
        type: "callout",
        children: [{ type: "whiteboard", whiteBoardContentId: "6", children: [{ text: "" }] }],
      },
      { type: "whiteboard", whiteBoardContentId: 5, children: [{ text: "" }] },
    ];
    expect(extractWhiteboardEmbeds(content)).toEqual([5, 6]);
  });
});
