import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@/electron", () => electronMocks);

import {
  createBatchReadSearchHitsTool,
  createBatchSearchProjectKnowledgeTool,
  createListResourceChaptersTool,
  createReadResourceChapterRangeTool,
  createReadResourceChapterTool,
  createReadResourceContentTool,
  createReadResourceRangeTool,
  createReadSearchHitContextTool,
  createVibeLearningSearchTool,
} from "@/tools/vibeLearningSearchTool";

const parse = (content: string) =>
  JSON.parse(content) as Record<string, unknown>;

describe("vibeLearningSearchTool", () => {
  beforeEach(() => {
    electronMocks.invoke.mockReset();
  });

  it("search_project_knowledge 应返回结构化证据与命中定位信息", async () => {
    electronMocks.invoke.mockResolvedValueOnce([
      {
        resourceId: 1,
        resourceName: "Transformer 原理",
        content:
          "Attention 的步骤是先计算 Query 与 Key 的相似度，再经 softmax 得到权重；其原理是用相似度分配注意力，关键细节包括缩放和掩码处理。",
        displayContent:
          "Attention 的步骤是先计算 Query 与 Key 的相似度，再经 softmax 得到权重；其原理是用相似度分配注意力，关键细节包括缩放和掩码处理。",
        searchContent:
          "attention 步骤 query key 相似度 softmax 权重 原理 注意力 关键细节 缩放 掩码",
        score: 0.92,
        hitType: "chapter",
        chapterIndex: 1,
        chapterTitle: "Attention 机制",
        chapterSummary: "介绍注意力计算方式。",
        chunkIndex: 10002,
        chunkIndexInSection: 2,
        chunkLevel: "section",
        sectionTitle: "Query / Key / Value",
        sectionPath: ["Attention 机制", "Query / Key / Value"],
        evidenceScore: 0.92,
        whyMatched: "命中章节正文，且与 Query、Key、Value 关键词高度重合。",
        rrfScore: 0.77,
        rerankScore: 0.88,
      },
    ]);

    const tool = createVibeLearningSearchTool(1, "main.db");
    const result = await tool.executor({
      query: "Attention 的 Query、Key、Value 是如何计算权重的？",
      limit: 5,
    });
    const payload = parse(String((result as { content: string }).content));
    const firstResult = (payload.results as Array<Record<string, unknown>>)[0];

    expect(payload.success).toBe(true);
    expect(payload.query).toBe(
      "Attention 的 Query、Key、Value 是如何计算权重的？",
    );
    expect(firstResult.displayContent).toBe(
      "Attention 的步骤是先计算 Query 与 Key 的相似度，再经 softmax 得到权重；其原理是用相似度分配注意力，关键细节包括缩放和掩码处理。",
    );
    expect(firstResult.searchContent).toBe(
      "attention 步骤 query key 相似度 softmax 权重 原理 注意力 关键细节 缩放 掩码",
    );
    expect(firstResult.chunkLevel).toBe("section");
    expect(firstResult.sectionTitle).toBe("Query / Key / Value");
    expect(firstResult.sectionPath).toEqual([
      "Attention 机制",
      "Query / Key / Value",
    ]);
    expect(firstResult.whyMatched).toContain("命中章节正文");
    expect("usageHint" in payload).toBe(false);
  });

  it("长耗时的 Vibe Learning 检索与阅读工具应显式声明充足超时", () => {
    const readHeavyTools = [
      createVibeLearningSearchTool(1, "main.db"),
      createBatchSearchProjectKnowledgeTool(1, "main.db"),
      createBatchReadSearchHitsTool(1, "main.db"),
      createReadResourceContentTool(1, "main.db"),
      createReadResourceRangeTool(1, "main.db"),
      createReadResourceChapterTool(1, "main.db"),
      createReadSearchHitContextTool(1, "main.db"),
      createReadResourceChapterRangeTool(1, "main.db"),
      createListResourceChaptersTool(1, "main.db"),
    ];

    for (const tool of readHeavyTools) {
      expect(tool.execution?.timeoutMs).toBeNull();
    }
  });

  it("batch_search_project_knowledge 应返回多查询结果，并保留显式标签", async () => {
    electronMocks.invoke.mockResolvedValue([
      {
        resourceId: 1,
        resourceName: "Transformer 原理",
        content: "Attention 通过 Query、Key、Value 计算权重。",
        displayContent: "Attention 通过 Query、Key、Value 计算权重。",
        searchContent: "attention query key value 计算 权重",
        score: 0.92,
        hitType: "chapter",
        chunkIndex: 10002,
        chunkLevel: "section",
        sectionTitle: "Query / Key / Value",
        sectionPath: ["Attention 机制", "Query / Key / Value"],
      },
    ]);

    const tool = createBatchSearchProjectKnowledgeTool(1, "main.db");
    const result = await tool.executor({
      queries: [
        { label: "原始问题", query: "Attention 如何计算权重" },
        { label: "概念拆分", query: "Query Key Value 的作用" },
      ],
      limitPerQuery: 3,
    });
    const payload = parse(String((result as { content: string }).content));
    const searches = payload.searches as Array<{
      label?: string;
      query: string;
      results: Array<{ sectionTitle: string }>;
    }>;

    expect(payload.success).toBe(true);
    expect(searches.length).toBe(2);
    expect(searches[0]?.label).toBe("原始问题");
    expect(searches[1]?.label).toBe("概念拆分");
    expect((searches[0]?.results?.[0] || {}).sectionTitle).toBe(
      "Query / Key / Value",
    );
  });

  it("batch_read_search_hits 应批量返回命中上下文", async () => {
    electronMocks.invoke.mockResolvedValue({
      success: true,
      resourceName: "Transformer 原理",
      hitType: "chapter",
      chapterIndex: 1,
      chapterTitle: "Attention 机制",
      chunkIndex: 10002,
      chunkIndexInSection: 2,
      startChunkIndex: 1,
      endChunkIndex: 3,
      content: "上下文内容",
    });

    const tool = createBatchReadSearchHitsTool(1, "main.db");
    const result = await tool.executor({
      hits: [
        { resourceName: "Transformer 原理", chunkIndex: 10002, radius: 1 },
        { resourceName: "Transformer 原理", chunkIndex: 10003, radius: 1 },
      ],
    });
    const payload = parse(String((result as { content: string }).content));

    expect(payload.success).toBe(true);
    expect((payload.contexts as Array<unknown>).length).toBe(2);
    expect(
      ((payload.contexts as Array<{ content: string }>)[0] || {}).content,
    ).toBe("上下文内容");
  });
});
