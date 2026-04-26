import { beforeEach, describe, expect, it, vi } from "vitest";

const commandMocks = vi.hoisted(() => ({
  searchPdfContent: vi.fn(),
  searchPdfSections: vi.fn(),
  getPdfDocumentInfo: vi.fn(),
  getPdfDocumentMap: vi.fn(),
  getPdfOutline: vi.fn(),
  getPdfSectionSummary: vi.fn(),
  getPdfPageContent: vi.fn(),
  getPdfPageRangeContent: vi.fn(),
  readPdfSection: vi.fn(),
  getPdfAnnotations: vi.fn(),
  getPdfBookmarks: vi.fn(),
}));

vi.mock("@/commands", () => commandMocks);

import {
  createGetPdfDocumentMapTool,
  createGetPdfSectionSummaryTool,
  createGetPdfBookmarksTool,
  createGetPdfDocumentInfoTool,
  createPdfSearchTool,
  createReadPdfSectionTool,
  createSearchPdfSectionsTool,
} from "@/tools/pdfSearchTool";

const parse = (content: string) =>
  JSON.parse(content) as Record<string, unknown>;

describe("pdfSearchTool", () => {
  beforeEach(() => {
    Object.values(commandMocks).forEach((mockFn) => mockFn.mockReset());
  });

  it("search_pdf_knowledge 返回页码和片段信息", async () => {
    commandMocks.getPdfDocumentInfo.mockResolvedValue({
      pdfId: 1,
      fileName: "demo.pdf",
      pageCount: 24,
      indexStatus: {
        pdfId: 1,
        state: "ready",
        pageCount: 24,
        updatedAt: 123,
      },
    });
    commandMocks.searchPdfContent.mockResolvedValue([
      {
        pdfId: 1,
        pageNumber: 3,
        chunkIndex: 1,
        snippet: "这是命中片段",
        content: "这是命中片段",
        source: "fts",
        score: 0.91,
        charStart: 5,
        charEnd: 18,
      },
    ]);

    const tool = createPdfSearchTool(1, "main.db");
    const result = await tool.executor({ query: "命中片段", limit: 5 });
    const payload = parse(String((result as { content: string }).content));

    expect(payload.success).toBe(true);
    expect(
      (payload.results as Array<{ pageNumber: number }>)[0].pageNumber,
    ).toBe(3);
    expect((payload.results as Array<{ source: string }>)[0].source).toBe(
      "fts",
    );
    expect(
      (payload.results as Array<{ citation: string }>)[0].citation,
    ).toContain(":pdfref[");
  });

  it("get_pdf_document_info 返回索引状态", async () => {
    commandMocks.getPdfDocumentInfo.mockResolvedValue({
      pdfId: 1,
      fileName: "demo.pdf",
      pageCount: 24,
      indexStatus: {
        pdfId: 1,
        state: "ready",
        pageCount: 24,
        updatedAt: 123,
      },
    });

    const tool = createGetPdfDocumentInfoTool(1, "main.db");
    const result = await tool.executor({});
    const payload = parse(String((result as { content: string }).content));

    expect(payload.success).toBe(true);
    expect(payload.fileName).toBe("demo.pdf");
    expect((payload.indexStatus as { state: string }).state).toBe("ready");
  });

  it("get_pdf_bookmarks 返回用户书签及页码", async () => {
    commandMocks.getPdfBookmarks.mockResolvedValue([
      {
        id: 1,
        pdfId: 2,
        bookmark: {
          title: "第一章",
          target: {
            type: "destination",
            destination: {
              pageIndex: 4,
            },
          },
          children: [],
        },
      },
    ]);

    const tool = createGetPdfBookmarksTool(2);
    const result = await tool.executor({});
    const payload = parse(String((result as { content: string }).content));

    expect(payload.success).toBe(true);
    expect(
      (payload.bookmarks as Array<{ pageNumber: number }>)[0].pageNumber,
    ).toBe(5);
    expect((payload.bookmarks as Array<{ title: string }>)[0].title).toBe(
      "第一章",
    );
  });

  it("get_pdf_document_map 返回总纲地图", async () => {
    commandMocks.getPdfDocumentMap.mockResolvedValue({
      pdfId: 1,
      fileName: "demo.pdf",
      pageCount: 12,
      indexStatus: {
        pdfId: 1,
        state: "ready",
        pageCount: 12,
        updatedAt: 123,
      },
      summary: {
        pdfId: 1,
        overview: "这是全文总览",
        themes: ["主题A"],
        chapterMap: [],
        mainArguments: ["主张A"],
        coreEvidence: ["证据A"],
        conclusion: ["结论A"],
        readingPaths: [],
        summarySource: "extractive",
        status: "ready",
      },
      sections: [],
    });

    const tool = createGetPdfDocumentMapTool(1, "main.db");
    const result = await tool.executor({ depth: 3 });
    const payload = parse(String((result as { content: string }).content));

    expect(payload.success).toBe(true);
    expect((payload.summary as { overview: string }).overview).toBe(
      "这是全文总览",
    );
    expect(payload.pageCount).toBe(12);
  });

  it("search_pdf_sections 返回章节层结果", async () => {
    commandMocks.searchPdfSections.mockResolvedValue([
      {
        pdfId: 1,
        sectionId: "section-1",
        title: "第一章",
        level: 1,
        pathTitles: ["第一章"],
        startPage: 1,
        endPage: 3,
        overview: "章节摘要",
        mainPoints: ["要点1"],
        arguments: ["论点1"],
        evidence: ["证据1"],
        conclusions: ["结论1"],
        terms: ["术语1"],
        questions: ["问题1"],
        summarySource: "extractive",
        status: "ready",
        score: 0.9,
        source: "fts",
      },
    ]);

    const tool = createSearchPdfSectionsTool(1, "main.db");
    const result = await tool.executor({ query: "第一章讲什么" });
    const payload = parse(String((result as { content: string }).content));

    expect(payload.success).toBe(true);
    expect((payload.results as Array<{ sectionId: string }>)[0].sectionId).toBe(
      "section-1",
    );
  });

  it("get_pdf_section_summary 返回章节摘要卡片", async () => {
    commandMocks.getPdfSectionSummary.mockResolvedValue({
      pdfId: 1,
      sectionId: "section-2",
      title: "第二章",
      level: 1,
      pathTitles: ["第二章"],
      startPage: 4,
      endPage: 8,
      overview: "这是第二章摘要",
      mainPoints: ["要点"],
      arguments: [],
      evidence: [],
      conclusions: [],
      terms: [],
      questions: [],
      summarySource: "extractive",
      status: "ready",
    });

    const tool = createGetPdfSectionSummaryTool(1, "main.db");
    const result = await tool.executor({ sectionId: "section-2" });
    const payload = parse(String((result as { content: string }).content));

    expect(payload.success).toBe(true);
    expect((payload.section as { title: string }).title).toBe("第二章");
  });

  it("read_pdf_section 返回章节页范围和内容", async () => {
    commandMocks.readPdfSection.mockResolvedValue({
      pdfId: 1,
      section: {
        pdfId: 1,
        sectionId: "section-3",
        title: "第三章",
        level: 1,
        pathTitles: ["第三章"],
        startPage: 9,
        endPage: 12,
        overview: "第三章摘要",
        mainPoints: [],
        arguments: [],
        evidence: [],
        conclusions: [],
        terms: [],
        questions: [],
        summarySource: "extractive",
        status: "ready",
      },
      breadcrumbs: [{ id: "第三章", title: "第三章" }],
      pages: [
        {
          pdfId: 1,
          pageNumber: 9,
          content: "第三章正文",
          charCount: 5,
        },
      ],
      content: "第三章正文",
    });

    const tool = createReadPdfSectionTool(1, "main.db");
    const result = await tool.executor({ sectionId: "section-3" });
    const payload = parse(String((result as { content: string }).content));

    expect(payload.success).toBe(true);
    expect((payload.detail as { content: string }).content).toContain(
      "第三章正文",
    );
    expect((payload.citations as string[])[0]).toContain(":pdfref[");
  });
});
