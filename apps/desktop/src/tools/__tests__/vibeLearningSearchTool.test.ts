import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@/electron", () => electronMocks);

import {
  createBatchReadSearchHitsTool,
  createGrepResourceContentTool,
  createReadResourceLinesTool,
  createReadResourceRangeTool,
  createVibeLearningSearchTool,
} from "@/tools/vibeLearningSearchTool";

const parse = (content: string) =>
  JSON.parse(content) as Record<string, unknown>;

describe("vibeLearningSearchTool", () => {
  beforeEach(() => {
    electronMocks.invoke.mockReset();
  });

  it("search_resource_content 应返回 chunk 坐标信息且不包含 chapter 字段", async () => {
    electronMocks.invoke.mockResolvedValueOnce([
      {
        resourceId: 1,
        resourceName: "Transformer 原理",
        content: "Attention 通过 Query、Key、Value 计算权重。",
        displayContent: "Attention 通过 Query、Key、Value 计算权重。",
        searchContent: "attention query key value 计算 权重",
        score: 0.92,
        chunkIndex: 2,
        chunkLevel: "passage",
        chunkStartLine: 21,
        chunkEndLine: 44,
        startOffset: 100,
        endOffset: 168,
        charCount: 68,
        evidenceScore: 0.92,
        whyMatched: "命中正文内容，可继续补读上下文。",
        rrfScore: 0.77,
        rerankScore: 0.88,
      },
    ]);

    const tool = createVibeLearningSearchTool(1, "main.db");
    const result = await tool.executor({
      query: "Attention 如何计算权重",
      limit: 5,
    });
    const payload = parse(String((result as { content: string }).content));
    const firstResult = (payload.results as Array<Record<string, unknown>>)[0];

    expect(tool.name).toBe("search_resource_content");
    expect(payload.success).toBe(true);
    expect(firstResult.resourceId).toBe(1);
    expect(firstResult.chunkIndex).toBe(2);
    expect(firstResult.chunkStartLine).toBe(21);
    expect(firstResult.chunkEndLine).toBe(44);
    expect(firstResult.startOffset).toBe(100);
    expect(firstResult.endOffset).toBe(168);
    expect(firstResult.charCount).toBe(68);
    expect("chapterIndex" in firstResult).toBe(false);
    expect("chapterTitle" in firstResult).toBe(false);
  });

  it("grep_resource_content 应调用后端 grep 并返回精确匹配坐标", async () => {
    electronMocks.invoke.mockResolvedValueOnce({
      success: true,
      query: "Query",
      results: [
        {
          resourceId: 1,
          resourceName: "Transformer 原理",
          lineNumber: 21,
          startOffset: 100,
          endOffset: 105,
          matchedText: "Query",
          preview: "Attention 通过 Query、Key、Value 计算权重。",
        },
      ],
    });

    const tool = createGrepResourceContentTool(1, "main.db");
    const result = await tool.executor({
      query: "Query",
      isRegex: false,
      ignoreCase: true,
      limit: 10,
    });
    const payload = parse(String((result as { content: string }).content));
    const firstResult = (payload.results as Array<Record<string, unknown>>)[0];

    expect(electronMocks.invoke).toHaveBeenCalledWith("vl-grep-content", {
      projectId: 1,
      mainDbName: "main.db",
      query: "Query",
      isRegex: false,
      ignoreCase: true,
      limit: 10,
    });
    expect(payload.success).toBe(true);
    expect(firstResult.startOffset).toBe(100);
    expect(firstResult.endOffset).toBe(105);
    expect(firstResult.matchedText).toBe("Query");
  });

  it("read_resource_lines 应按行范围读取资源内容", async () => {
    electronMocks.invoke.mockResolvedValueOnce({
      success: true,
      resourceId: 1,
      resourceName: "Transformer 原理",
      startLine: 21,
      endLine: 44,
      totalLines: 120,
      content: "局部正文",
    });

    const tool = createReadResourceLinesTool(1, "main.db");
    const result = await tool.executor({
      resourceId: 1,
      startLine: 21,
      endLine: 44,
    });
    const payload = parse(String((result as { content: string }).content));

    expect(electronMocks.invoke).toHaveBeenCalledWith(
      "vl-read-resource-lines",
      {
        projectId: 1,
        resourceId: 1,
        mainDbName: "main.db",
        startLine: 21,
        endLine: 44,
      },
    );
    expect(payload.content).toBe("局部正文");
  });

  it("read_resource_range 应按字符范围读取资源内容", async () => {
    electronMocks.invoke.mockResolvedValueOnce({
      success: true,
      resourceId: 1,
      resourceName: "Transformer 原理",
      startOffset: 100,
      endOffset: 168,
      totalChars: 1200,
      content: "局部正文",
    });

    const tool = createReadResourceRangeTool(1, "main.db");
    const result = await tool.executor({
      resourceId: 1,
      startOffset: 100,
      endOffset: 168,
    });
    const payload = parse(String((result as { content: string }).content));

    expect(electronMocks.invoke).toHaveBeenCalledWith(
      "vl-read-resource-range",
      {
        projectId: 1,
        resourceId: 1,
        mainDbName: "main.db",
        startOffset: 100,
        endOffset: 168,
      },
    );
    expect(payload.startOffset).toBe(100);
    expect(payload.endOffset).toBe(168);
    expect(payload.content).toBe("局部正文");
  });

  it("batch_read_search_hits 应优先按字符范围批量补读上下文", async () => {
    electronMocks.invoke.mockResolvedValueOnce({
      success: true,
      resourceId: 1,
      resourceName: "Transformer 原理",
      startOffset: 80,
      endOffset: 188,
      totalChars: 1200,
      content: "字符范围正文",
    });

    const tool = createBatchReadSearchHitsTool(1, "main.db");
    const result = await tool.executor({
      hits: [
        {
          resourceId: 1,
          resourceName: "Transformer 原理",
          startOffset: 100,
          endOffset: 168,
          contextChars: 20,
        },
      ],
    });
    const payload = parse(String((result as { content: string }).content));

    expect(electronMocks.invoke).toHaveBeenCalledWith(
      "vl-read-resource-range",
      {
        projectId: 1,
        resourceId: 1,
        resourceName: "Transformer 原理",
        mainDbName: "main.db",
        startOffset: 80,
        endOffset: 188,
      },
    );
    expect(payload.success).toBe(true);
    expect(
      (payload.contexts as Array<Record<string, unknown>>)[0]?.content,
    ).toBe("字符范围正文");
  });

  it("batch_read_search_hits 应在缺少字符范围时按行范围批量补读上下文", async () => {
    electronMocks.invoke.mockResolvedValueOnce({
      success: true,
      resourceId: 1,
      resourceName: "Transformer 原理",
      startLine: 19,
      endLine: 46,
      totalLines: 120,
      content: "行范围正文",
    });

    const tool = createBatchReadSearchHitsTool(1, "main.db");
    const result = await tool.executor({
      hits: [
        {
          resourceId: 1,
          resourceName: "Transformer 原理",
          chunkStartLine: 21,
          chunkEndLine: 44,
          contextLines: 2,
        },
      ],
    });
    const payload = parse(String((result as { content: string }).content));

    expect(electronMocks.invoke).toHaveBeenCalledWith(
      "vl-read-resource-lines",
      {
        projectId: 1,
        resourceId: 1,
        resourceName: "Transformer 原理",
        mainDbName: "main.db",
        startLine: 19,
        endLine: 46,
      },
    );
    expect(payload.success).toBe(true);
    expect(
      (payload.contexts as Array<Record<string, unknown>>)[0]?.content,
    ).toBe("行范围正文");
  });

  it("长耗时的 Vibe Learning 检索与阅读工具应显式声明充足超时", () => {
    const readHeavyTools = [
      createVibeLearningSearchTool(1, "main.db"),
      createGrepResourceContentTool(1, "main.db"),
      createReadResourceLinesTool(1, "main.db"),
      createReadResourceRangeTool(1, "main.db"),
      createBatchReadSearchHitsTool(1, "main.db"),
    ];

    for (const tool of readHeavyTools) {
      expect(tool.execution?.timeoutMs).toBeNull();
    }
  });

  it("不再暴露已移除后端 IPC 的 read_search_hit_context 工具", async () => {
    const toolsModule = await import("@/tools/vibeLearningSearchTool");

    expect("createReadSearchHitContextTool" in toolsModule).toBe(false);
  });
});
