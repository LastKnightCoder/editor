import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ searchContent: vi.fn() }));
vi.mock("@/utils/search", () => ({ searchContent: mocks.searchContent }));
vi.mock("@/stores/useSettingStore", () => ({ default: { getState: () => ({ setting: {} }) } }));
vi.mock("@/utils/embedding-model-info", () => ({
  resolveEmbeddingModelInfoFromSetting: () => undefined,
}));

import { createKnowledgeSearchTool } from "../knowledgeSearchTool";

describe("search_knowledge 覆盖外部材料（E2）", () => {
  it("节索引尚未就绪时只返回片段，不回退整篇", async () => {
    mocks.searchContent.mockResolvedValue([
      {
        id: 1,
        type: "article",
        title: "长文",
        content: [
          { type: "paragraph", children: [{ type: "formatted", text: "未定位的整篇正文" }] },
        ],
        snippet: "词面命中片段",
      },
    ]);
    const result = await createKnowledgeSearchTool().executor({ query: "命中" }, {} as never);
    const payload = JSON.parse((result as { content: string }).content);
    expect(payload.results[0]).toMatchObject({ content: "词面命中片段", sectionUnavailable: true });
    expect(JSON.stringify(payload)).not.toContain("未定位的整篇正文");
  });
  it("长文只返回命中节与定位，不带整篇正文", async () => {
    mocks.searchContent.mockResolvedValue([
      {
        id: 1,
        type: "article",
        contentId: 2,
        title: "文章",
        source: "fts",
        updateTime: 1,
        content: [{ type: "paragraph", children: [{ type: "formatted", text: "无关整篇内容" }] }],
        section: {
          chunkIndex: 1,
          headingPath: "命中节",
          text: "相关观点",
          blockStart: 3,
          blockEnd: 4,
        },
      },
    ]);
    const result = await createKnowledgeSearchTool().executor({ query: "观点" }, {} as never);
    const payload = JSON.parse((result as { content: string }).content);
    expect(payload.results[0].content).toBe("相关观点");
    expect(payload.results[0].section.blockStart).toBe(3);
    expect(JSON.stringify(payload)).not.toContain("无关整篇内容");
  });
  it("卡片整篇一节：给命中文本，不给定位", async () => {
    mocks.searchContent.mockResolvedValue([
      {
        id: 5,
        type: "card",
        contentId: 6,
        title: "卡片",
        source: "vec-document",
        updateTime: 1,
        content: [],
        section: { chunkIndex: 0, headingPath: "", text: "卡片正文", blockStart: 0, blockEnd: 0 },
      },
    ]);
    const result = await createKnowledgeSearchTool().executor({ query: "卡片" }, {} as never);
    const payload = JSON.parse((result as { content: string }).content);
    expect(payload.results[0].content).toBe("卡片正文");
    expect(payload.results[0].section).toBeUndefined();
  });
  beforeEach(() => vi.clearAllMocks());

  it("默认检索正文与三类材料；材料结果带出处", async () => {
    mocks.searchContent.mockResolvedValue([
      {
        id: 8,
        contentId: 0,
        type: "excerpt",
        title: "地方政府",
        source: "vec-document",
        updateTime: 1,
        content: [{ type: "paragraph", children: [{ type: "formatted", text: "地方政府" }] }],
        material: { meta: "微信读书 · 《置身事内》 · 第一章" },
      },
    ]);
    const tool = createKnowledgeSearchTool();
    const result = await tool.executor({ query: "土地财政" }, {} as never);

    expect(mocks.searchContent.mock.calls[0][0].types).toEqual([
      "card",
      "article",
      "project-item",
      "diary-moment",
      "excerpt",
      "pdf-annotation",
      "web-clip",
    ]);
    const payload = JSON.parse((result as { content: string }).content);
    expect(payload.results[0]).toMatchObject({
      type: "excerpt",
      typeName: "划线",
      from: "微信读书 · 《置身事内》 · 第一章",
    });
  });

  it("限定类型时过滤非法值", async () => {
    mocks.searchContent.mockResolvedValue([]);
    await createKnowledgeSearchTool().executor(
      { query: "x", types: ["pdf-annotation", "bogus"] },
      {} as never
    );
    expect(mocks.searchContent.mock.calls[0][0].types).toEqual(["pdf-annotation"]);
  });
});
