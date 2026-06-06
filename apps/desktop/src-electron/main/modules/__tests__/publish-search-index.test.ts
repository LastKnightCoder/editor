import Fuse from "fuse.js";
import { describe, expect, it } from "vitest";

import {
  buildPublishSearchIndexPayload,
  buildPublishSearchItems,
  getDocSearchType,
  PUBLISH_SEARCH_OPTIONS,
} from "../publish-search-index";

const paragraph = (text: string) => [
  {
    type: "paragraph",
    children: [{ type: "formatted", text }],
  },
];

describe("publish-search-index", () => {
  it("应区分项目文档和知识库文档", () => {
    expect(getDocSearchType("project")).toBe("project-doc");
    expect(getDocSearchType("document")).toBe("knowledge-doc");

    const items = buildPublishSearchItems({
      cards: [],
      articles: [],
      quests: [],
      docs: [
        {
          id: 1,
          title: "项目发布手册",
          summary: "项目说明",
          href: "/docs/project/10/1.html",
          createTime: 1,
          updateTime: 2,
          tags: [],
          kind: "project",
          content: paragraph("项目文档正文") as any,
        },
        {
          id: 2,
          title: "知识库发布手册",
          summary: "知识库说明",
          href: "/docs/document/20/2.html",
          createTime: 1,
          updateTime: 3,
          tags: [],
          kind: "document",
          content: paragraph("知识库文档正文") as any,
        },
      ],
    });

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "project-doc",
          typeLabel: "项目文档",
        }),
        expect.objectContaining({
          type: "knowledge-doc",
          typeLabel: "知识库文档",
        }),
      ]),
    );
  });

  it("应使用 Markdown 正文生成可恢复的 Fuse 索引", () => {
    const payload = buildPublishSearchIndexPayload({
      generatedAt: 100,
      cards: [
        {
          id: 10,
          content: [
            {
              type: "header",
              level: 1,
              children: [{ type: "formatted", text: "卡片标题" }],
            },
            {
              type: "code-block",
              language: "ts",
              code: "const indexedKeyword = true;",
              children: [{ type: "formatted", text: "" }],
            },
          ] as any,
          tags: ["发布"],
          category: "permanent",
          create_time: 1,
          update_time: 2,
        } as any,
      ],
      articles: [],
      docs: [],
      quests: [],
    });

    expect(payload).toMatchObject({
      version: 1,
      generatedAt: 100,
      items: [
        expect.objectContaining({
          type: "card",
          title: "卡片标题",
          content: expect.stringContaining("indexedKeyword"),
        }),
      ],
    });

    const fuse = new Fuse(
      payload.items,
      PUBLISH_SEARCH_OPTIONS,
      Fuse.parseIndex(payload.index as any),
    );

    const results = fuse.search("indexedKeyword");
    expect(results[0]?.item.id).toBe(10);
  });
});
