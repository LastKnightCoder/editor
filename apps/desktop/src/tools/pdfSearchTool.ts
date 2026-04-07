import { PdfActionType } from "@embedpdf/models";
import type {
  PdfAnnotationContext,
  PdfAnnotation,
  PdfBookmark,
  ToolDefinition,
} from "@/types";
import { buildPdfCitationMarkdown } from "@/pages/PdfView/pdfCitation";
import {
  getPdfAnnotations,
  getPdfBookmarks,
  getPdfDocumentMap,
  getPdfDocumentInfo,
  getPdfOutline,
  getPdfPageContent,
  getPdfPageRangeContent,
  getPdfSectionSummary,
  readPdfSection,
  searchPdfSections,
  searchPdfContent,
} from "@/commands";

const tryParseLimit = (
  value: unknown,
  fallback: number,
  max: number,
): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
};

const normalizeQuery = (value: unknown): string => String(value || "").trim();

const annotationToContext = (
  annotation: PdfAnnotation,
): PdfAnnotationContext => ({
  id: annotation.id,
  pdfId: annotation.pdfId,
  pageNumber:
    (annotation.annotation.pageIndex ?? annotation.areaData?.pageIndex ?? 0) +
    1,
  type: annotation.type || "text-markup",
  color: annotation.color,
  snippet: annotation.annotation.contents || "",
  notes: annotation.notes || [],
  areaData: annotation.areaData,
});

const getBookmarkPageNumber = (bookmark: PdfBookmark): number | null => {
  const target = bookmark.bookmark.target;
  if (!target) {
    return null;
  }
  if (target.type === "destination") {
    return (target.destination?.pageIndex ?? 0) + 1;
  }
  if (target.type === "action") {
    const action = target.action;
    if (
      (action.type === PdfActionType.Goto ||
        action.type === PdfActionType.RemoteGoto) &&
      "destination" in action &&
      action.destination
    ) {
      const destination = action.destination;
      return (destination.pageIndex ?? 0) + 1;
    }
  }
  return null;
};

export const createPdfSearchTool = (
  pdfId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "search_pdf_knowledge",
  description:
    "搜索当前 PDF 的原文索引，返回最相关的片段、所在页码和相关性分数。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "问题或关键词",
      },
      limit: {
        type: "number",
        description: "返回条数，默认 5，最大 10",
      },
    },
    required: ["query"],
  },
  executor: async (args) => {
    const query = normalizeQuery(args.query);
    const limit = tryParseLimit(args.limit, 5, 10);
    if (!query) {
      return {
        content: JSON.stringify({
          success: false,
          error: "query 不能为空",
          results: [],
        }),
      };
    }

    const info = await getPdfDocumentInfo({ pdfId, mainDbName });
    if (info.indexStatus.state === "failed") {
      return {
        content: JSON.stringify({
          success: false,
          error: info.indexStatus.error || "PDF 索引构建失败",
          indexStatus: info.indexStatus,
          results: [],
        }),
      };
    }

    const results = await searchPdfContent({
      pdfId,
      mainDbName,
      query,
      limit,
    });

    return {
      content: JSON.stringify({
        success: results.length > 0 || info.indexStatus.state === "ready",
        message: `找到 ${results.length} 条相关片段`,
        indexStatus: info.indexStatus,
        results: results.map((item) => ({
          pageNumber: item.pageNumber,
          chunkIndex: item.chunkIndex,
          snippet: item.snippet,
          citation: buildPdfCitationMarkdown({
            pageNumber: item.pageNumber,
            charStart: item.charStart,
            charEnd: item.charEnd,
            previewText: item.snippet,
          }),
          score: item.score,
          source: item.source,
          charStart: item.charStart,
          charEnd: item.charEnd,
          rrfScore: item.rrfScore,
          rerankScore: item.rerankScore,
        })),
      }),
    };
  },
});

export const createGetPdfDocumentInfoTool = (
  pdfId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "get_pdf_document_info",
  description: "读取当前 PDF 的文件名、总页数和索引状态。",
  parameters: {
    type: "object",
    properties: {},
  },
  executor: async () => {
    const info = await getPdfDocumentInfo({ pdfId, mainDbName });
    return {
      content: JSON.stringify({
        success: info.indexStatus.state !== "failed",
        pdfId: info.pdfId,
        fileName: info.fileName,
        pageCount: info.pageCount,
        indexStatus: info.indexStatus,
        error:
          info.indexStatus.state === "failed"
            ? info.indexStatus.error || "PDF 索引构建失败"
            : undefined,
      }),
    };
  },
});

export const createGetPdfOutlineTool = (
  pdfId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "get_pdf_outline",
  description: "读取当前 PDF 的目录结构和对应页码。",
  parameters: {
    type: "object",
    properties: {},
  },
  executor: async () => {
    const outline = await getPdfOutline({ pdfId, mainDbName });
    return {
      content: JSON.stringify({
        success: true,
        outline,
      }),
    };
  },
});

export const createGetPdfDocumentMapTool = (
  pdfId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "get_pdf_document_map",
  description: "读取当前 PDF 的总纲地图，包括文档总览、章节树和各章节摘要。",
  parameters: {
    type: "object",
    properties: {
      depth: {
        type: "number",
        description: "返回的章节树深度，默认 2，最大 6",
      },
    },
  },
  executor: async (args) => {
    const depth = tryParseLimit(args.depth, 2, 6);
    const map = await getPdfDocumentMap({ pdfId, mainDbName, depth });
    return {
      content: JSON.stringify({
        success: map.indexStatus.state !== "failed",
        pdfId: map.pdfId,
        fileName: map.fileName,
        pageCount: map.pageCount,
        indexStatus: map.indexStatus,
        summary: map.summary,
        sections: map.sections,
      }),
    };
  },
});

export const createSearchPdfSectionsTool = (
  pdfId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "search_pdf_sections",
  description: "搜索当前 PDF 的章节摘要层，适合定位相关章节和整体主题。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "问题或关键词",
      },
      limit: {
        type: "number",
        description: "返回条数，默认 5，最大 10",
      },
    },
    required: ["query"],
  },
  executor: async (args) => {
    const query = normalizeQuery(args.query);
    const limit = tryParseLimit(args.limit, 5, 10);
    if (!query) {
      return {
        content: JSON.stringify({
          success: false,
          error: "query 不能为空",
          results: [],
        }),
      };
    }
    const results = await searchPdfSections({
      pdfId,
      mainDbName,
      query,
      limit,
    });
    return {
      content: JSON.stringify({
        success: true,
        total: results.length,
        results,
      }),
    };
  },
});

export const createGetPdfSectionSummaryTool = (
  pdfId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "get_pdf_section_summary",
  description: "读取当前 PDF 某个章节的深度摘要卡片。",
  parameters: {
    type: "object",
    properties: {
      sectionId: {
        type: "string",
        description:
          "章节 ID，可通过 get_pdf_document_map 或 search_pdf_sections 获取",
      },
    },
    required: ["sectionId"],
  },
  executor: async (args) => {
    const sectionId = normalizeQuery(args.sectionId);
    if (!sectionId) {
      return {
        content: JSON.stringify({
          success: false,
          error: "sectionId 不能为空",
        }),
      };
    }
    const summary = await getPdfSectionSummary({
      pdfId,
      mainDbName,
      sectionId,
    });
    return {
      content: JSON.stringify({
        success: Boolean(summary),
        section: summary,
        error: summary ? undefined : `未找到章节 ${sectionId}`,
      }),
    };
  },
});

export const createReadPdfSectionTool = (
  pdfId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "read_pdf_section",
  description: "按章节读取当前 PDF 的页范围、摘要和完整文本。",
  parameters: {
    type: "object",
    properties: {
      sectionId: {
        type: "string",
        description:
          "章节 ID，可通过 get_pdf_document_map 或 search_pdf_sections 获取",
      },
    },
    required: ["sectionId"],
  },
  executor: async (args) => {
    const sectionId = normalizeQuery(args.sectionId);
    if (!sectionId) {
      return {
        content: JSON.stringify({
          success: false,
          error: "sectionId 不能为空",
        }),
      };
    }
    const detail = await readPdfSection({
      pdfId,
      mainDbName,
      sectionId,
    });
    return {
      content: JSON.stringify({
        success: Boolean(detail),
        detail,
        citations:
          detail?.pages.map((page) =>
            buildPdfCitationMarkdown({
              pageNumber: page.pageNumber,
              previewText: page.content,
            }),
          ) || [],
        error: detail ? undefined : `未找到章节 ${sectionId}`,
      }),
    };
  },
});

export const createReadPdfPageTool = (
  pdfId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "read_pdf_page",
  description: "读取当前 PDF 指定页的完整文本内容。",
  parameters: {
    type: "object",
    properties: {
      pageNumber: {
        type: "number",
        description: "页码，从 1 开始",
      },
    },
    required: ["pageNumber"],
  },
  executor: async (args) => {
    const pageNumber = Number(args.pageNumber);
    if (!Number.isFinite(pageNumber) || pageNumber <= 0) {
      return {
        content: JSON.stringify({
          success: false,
          error: "pageNumber 必须是大于 0 的数字",
        }),
      };
    }
    const info = await getPdfDocumentInfo({ pdfId, mainDbName });
    if (info.indexStatus.state === "failed") {
      return {
        content: JSON.stringify({
          success: false,
          page: null,
          error: info.indexStatus.error || "PDF 索引构建失败，无法读取页内容",
          indexStatus: info.indexStatus,
        }),
      };
    }
    const page = await getPdfPageContent({ pdfId, mainDbName, pageNumber });
    return {
      content: JSON.stringify({
        success: Boolean(page),
        page,
        citation: page
          ? buildPdfCitationMarkdown({
              pageNumber: page.pageNumber,
              previewText: page.content,
            })
          : undefined,
        indexStatus: info.indexStatus,
        error: page ? undefined : `未找到第 ${pageNumber} 页内容`,
      }),
    };
  },
});

export const createReadPdfPageRangeTool = (
  pdfId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "read_pdf_page_range",
  description: "按页范围读取当前 PDF 的文本内容。",
  parameters: {
    type: "object",
    properties: {
      startPage: {
        type: "number",
        description: "起始页码，从 1 开始",
      },
      endPage: {
        type: "number",
        description: "结束页码，从 1 开始，且不小于起始页",
      },
    },
    required: ["startPage", "endPage"],
  },
  executor: async (args) => {
    const startPage = Number(args.startPage);
    const endPage = Number(args.endPage);
    if (
      !Number.isFinite(startPage) ||
      !Number.isFinite(endPage) ||
      startPage <= 0 ||
      endPage < startPage
    ) {
      return {
        content: JSON.stringify({
          success: false,
          error: "startPage/endPage 参数不合法",
          pages: [],
        }),
      };
    }
    const info = await getPdfDocumentInfo({ pdfId, mainDbName });
    if (info.indexStatus.state === "failed") {
      return {
        content: JSON.stringify({
          success: false,
          startPage,
          endPage,
          count: 0,
          pages: [],
          citations: [],
          error:
            info.indexStatus.error || "PDF 索引构建失败，无法读取页范围内容",
          indexStatus: info.indexStatus,
        }),
      };
    }

    const pages = await getPdfPageRangeContent({
      pdfId,
      mainDbName,
      startPage,
      endPage,
    });
    return {
      content: JSON.stringify({
        success: pages.length > 0,
        startPage,
        endPage,
        count: pages.length,
        pages,
        citations: pages.map((page) =>
          buildPdfCitationMarkdown({
            pageNumber: page.pageNumber,
            previewText: page.content,
          }),
        ),
        indexStatus: info.indexStatus,
        error:
          pages.length > 0
            ? undefined
            : `未找到第 ${startPage} 到 ${endPage} 页的索引内容`,
      }),
    };
  },
});

export const createGetPdfAnnotationsTool = (pdfId: number): ToolDefinition => ({
  name: "get_pdf_annotations",
  description: "获取当前 PDF 的标注、区域截图和关联笔记。",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "返回条数，默认 20，最大 100",
      },
    },
  },
  executor: async (args) => {
    const limit = tryParseLimit(args.limit, 20, 100);
    const annotations = await getPdfAnnotations(pdfId);
    return {
      content: JSON.stringify({
        success: true,
        total: annotations.length,
        annotations: annotations.slice(0, limit).map(annotationToContext),
      }),
    };
  },
});

export const createGetPdfBookmarksTool = (pdfId: number): ToolDefinition => ({
  name: "get_pdf_bookmarks",
  description: "获取当前 PDF 的用户书签及其页码。",
  parameters: {
    type: "object",
    properties: {},
  },
  executor: async () => {
    const bookmarks = await getPdfBookmarks(pdfId);
    return {
      content: JSON.stringify({
        success: true,
        total: bookmarks.length,
        bookmarks: bookmarks.map((bookmark) => ({
          id: bookmark.id,
          pdfId: bookmark.pdfId,
          title: bookmark.bookmark.title || "未命名书签",
          pageNumber: getBookmarkPageNumber(bookmark),
        })),
      }),
    };
  },
});
