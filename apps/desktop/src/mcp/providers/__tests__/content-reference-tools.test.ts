import { describe, expect, it, vi } from "vitest";

vi.mock("@/commands/content", () => ({
  getContentById: vi.fn(async () => ({
    id: 301,
    updateTime: 1710000000000,
    content: [],
  })),
}));

vi.mock("@/commands/article", () => ({
  getArticleByContentId: vi.fn(async () => ({
    id: 8,
    title: "测试文章",
    contentId: 301,
  })),
}));

vi.mock("@/services/content-editing/resolver", () => ({
  loadSnapshotForContent: vi.fn(async () => ({
    snapshot: {
      id: "snapshot-1",
      hash: "hash-1",
      markdown: "# 正文\n\n第一段\n\n第二段",
    },
    source: "mock",
  })),
}));

vi.mock("@/utils/editor", () => ({
  getEditorText: vi.fn(() => "正文标题"),
}));

vi.mock("@/utils/answer-content", () => ({
  getAnswerContentStatus: vi.fn(async () => ({
    contentId: 301,
    isCard: false,
    isArticle: true,
    projectMountCount: 0,
    documentMountCount: 0,
  })),
  getAnswerPrimaryContentType: vi.fn(() => "article"),
}));

import { contentReferenceToolsProvider } from "../content-reference-tools";

const getJsonPayload = (
  result: string | { content: string } | null | undefined,
) => {
  if (!result || typeof result === "string" || !("content" in result)) {
    throw new Error("工具执行结果不是预期的 JSON 对象");
  }
  return JSON.parse(result.content);
};

describe("content-reference-tools", () => {
  it("应按 contentId 返回正文 markdown 与元信息", async () => {
    const tool = contentReferenceToolsProvider
      .tools()
      .find((item) => item.name === "get_referenced_content");

    expect(tool).toBeTruthy();

    const result = await tool!.executor({ contentId: 301 });
    const payload = getJsonPayload(result);

    expect(payload).toMatchObject({
      success: true,
      contentId: 301,
      title: "测试文章",
      contentType: "article",
      markdown: "# 正文\n\n第一段\n\n第二段",
      totalLength: "# 正文\n\n第一段\n\n第二段".length,
    });
  });

  it("应返回可供模型使用的引用元数据", async () => {
    const tool = contentReferenceToolsProvider
      .tools()
      .find((item) => item.name === "get_referenced_content_meta");

    expect(tool).toBeTruthy();

    const result = await tool!.executor({ contentId: 301 });
    const payload = getJsonPayload(result);

    expect(payload).toMatchObject({
      success: true,
      contentId: 301,
      title: "测试文章",
      contentType: "article",
      hash: "hash-1",
      snapshotId: "snapshot-1",
    });
  });
});
