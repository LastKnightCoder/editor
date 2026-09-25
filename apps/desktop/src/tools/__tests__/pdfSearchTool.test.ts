import { beforeEach, describe, expect, it, vi } from "vitest";

const commandMocks = vi.hoisted(() => ({
  searchPdfContent: vi.fn(),
  getPdfDocumentInfo: vi.fn(),
  getPdfOutline: vi.fn(),
  getPdfPageContent: vi.fn(),
  getPdfPageRangeContent: vi.fn(),
  getPdfAnnotations: vi.fn(),
  getPdfBookmarks: vi.fn(),
}));

vi.mock("@/commands", () => commandMocks);

import {
  createGetPdfBookmarksTool,
  createGetPdfDocumentInfoTool,
  createPdfSearchTool,
} from "@/tools/pdfSearchTool";

const parse = (content: string) => JSON.parse(content) as Record<string, unknown>;

describe("pdfSearchTool", () => {
  beforeEach(() => {
    Object.values(commandMocks).forEach(mockFn => mockFn.mockReset());
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
    expect((payload.results as Array<{ pageNumber: number }>)[0].pageNumber).toBe(3);
    expect((payload.results as Array<{ source: string }>)[0].source).toBe("fts");
    expect((payload.results as Array<{ citation: string }>)[0].citation).toContain(":pdfref[");
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
    expect((payload.bookmarks as Array<{ pageNumber: number }>)[0].pageNumber).toBe(5);
    expect((payload.bookmarks as Array<{ title: string }>)[0].title).toBe("第一章");
  });
});
