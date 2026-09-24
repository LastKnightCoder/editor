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
  })),
  getAnswerPrimaryContentType: vi.fn(() => "article"),
}));

import { loadContentMarkdownPayload, loadReferencedContentBase } from "../content-read-utils";

describe("content-read-utils", () => {
  it("应返回统一的 markdown 读取结果，并支持 range 截断", async () => {
    const payload = await loadContentMarkdownPayload(301, [0, 4]);

    expect(payload).toEqual({
      contentId: 301,
      markdown: "# 正文",
      hash: "hash-1",
      snapshotId: "snapshot-1",
      source: "mock",
      totalLength: "# 正文\n\n第一段\n\n第二段".length,
      returnedLength: "# 正文".length,
      truncated: true,
      range: {
        start: 0,
        end: 4,
      },
    });
  });

  it("应返回引用内容所需的标题与类型元数据", async () => {
    const payload = await loadReferencedContentBase(301);

    expect(payload).toMatchObject({
      contentId: 301,
      contentType: "article",
      title: "测试文章",
      hash: "hash-1",
      snapshotId: "snapshot-1",
      totalLength: "# 正文\n\n第一段\n\n第二段".length,
      updateTime: 1710000000000,
    });
    expect(payload.markdown).toBe("# 正文\n\n第一段\n\n第二段");
  });
});
