import { describe, expect, it } from "vitest";
import { buildPublishSearchIndexPayload } from "../publish-search-index";
import { contentRef } from "../publish-content-link-targets";
const paragraph = (text: string) => [
  { type: "paragraph", children: [{ type: "formatted", text }] },
];
describe("公开搜索数据", () => {
  it("项目文档使用稳定身份，没有公开链接、UI 文案或 Fuse 私有格式", () => {
    const payload = buildPublishSearchIndexPayload({
      cards: [],
      articles: [],
      docs: [
        {
          id: 34,
          entityId: 12,
          title: "项目手册",
          summary: "摘要",
          target: contentRef("doc", 34, 12),
          createTime: 1,
          updateTime: 2,
          tags: [],
          kind: "project",
          content: paragraph("共享协议") as any,
        },
      ],
    });
    expect(Object.keys(payload).sort()).toEqual(["documents", "version"]);
    expect(payload.documents).toEqual([
      {
        key: "doc:project:12:34",
        type: "doc",
        id: 34,
        title: "项目手册",
        summary: "摘要",
        content: "共享协议",
        tags: [],
      },
    ]);
  });
  it("代码正文可搜索，数据不随生成时间变化", () => {
    const input = {
      cards: [
        {
          id: 10,
          content: [
            ...paragraph("卡片标题"),
            { type: "code-block", code: "const indexedKeyword = true;", children: [{ text: "" }] },
          ],
          tags: ["发布"],
        } as any,
      ],
      articles: [],
      docs: [],
    };
    const first = buildPublishSearchIndexPayload(input);
    expect(first.documents[0].content).toContain("indexedKeyword");
    expect(first.documents[0]).not.toHaveProperty("href");
    expect(buildPublishSearchIndexPayload(input)).toEqual(first);
  });
});
