import { invoke } from "@/electron";
import {
  Pdf,
  PdfAnnotation,
  CreatePdfAnnotation,
  PdfBookmark,
  CreatePdfBookmark,
  PdfIndexStatus,
  PdfSearchResult,
  PdfDocumentInfo,
  PdfPageContent,
  PdfOutlineNode,
  PdfDocumentMap,
  PdfSectionDetail,
  PdfLibraryItem,
} from "@/types";

export const createPdf = async (
  pdf: Omit<Pdf, "id" | "createTime" | "updateTime">
): Promise<Pdf> => {
  return await invoke("create-pdf", pdf);
};

export const updatePdf = async (pdf: Pdf): Promise<Pdf> => {
  return await invoke("update-pdf", pdf);
};

export const getPdfById = async (id: number): Promise<Pdf> => {
  return await invoke("get-pdf-by-id", id);
};

export const getPdfList = async (): Promise<Pdf[]> => {
  return await invoke("get-pdf-list");
};

export const removePdf = async (id: number): Promise<number> => {
  return await invoke("delete-pdf", id);
};

/** 列表页数据：Pdf 行 + 标注数 + 缩略图 */
export const getPdfLibrary = async (): Promise<PdfLibraryItem[]> => {
  return await invoke("pdf:library");
};

/** 记录打开时间（不改 updateTime） */
export const recordPdfOpen = async (id: number): Promise<void> => {
  await invoke("pdf:record-open", id);
};

/** 记录读到的页（从 1 开始，不改 updateTime） */
export const recordPdfPage = async (id: number, page: number): Promise<void> => {
  await invoke("pdf:record-page", id, page);
};

export const savePdfThumbnail = async (
  id: number,
  image: Uint8Array,
  pageCount: number
): Promise<void> => {
  await invoke("pdf:save-thumbnail", id, image, pageCount);
};

export const addPdfAnnotation = async (annotation: CreatePdfAnnotation): Promise<PdfAnnotation> => {
  return await invoke("add-pdf-annotation", annotation);
};

export const updatePdfAnnotation = async (annotation: PdfAnnotation): Promise<PdfAnnotation> => {
  return await invoke("update-pdf-annotation", annotation);
};

export const getPdfAnnotations = async (pdfId: number): Promise<PdfAnnotation[]> => {
  return await invoke("get-pdf-annotations", pdfId);
};

export const removePdfAnnotation = async (id: number): Promise<number> => {
  return await invoke("delete-pdf-annotation", id);
};

export const addPdfBookmark = async (bookmark: CreatePdfBookmark): Promise<PdfBookmark> => {
  return await invoke("add-pdf-bookmark", bookmark);
};

export const updatePdfBookmark = async (bookmark: PdfBookmark): Promise<PdfBookmark> => {
  return await invoke("update-pdf-bookmark", bookmark);
};

export const getPdfBookmarks = async (pdfId: number): Promise<PdfBookmark[]> => {
  return await invoke("get-pdf-bookmarks", pdfId);
};

export const removePdfBookmark = async (id: number): Promise<number> => {
  return await invoke("delete-pdf-bookmark", id);
};

export const ensurePdfIndex = async (params: {
  pdfId: number;
  resolvedPath: string;
  fileName: string;
  mainDbName: string;
  force?: boolean;
}): Promise<PdfIndexStatus> => {
  return await invoke("pdf-index:ensure", params);
};

export const rebuildPdfIndex = async (params: {
  pdfId: number;
  resolvedPath: string;
  fileName: string;
  mainDbName: string;
}): Promise<PdfIndexStatus> => {
  return await invoke("pdf-index:rebuild", params);
};

export const getPdfIndexStatus = async (params: {
  pdfId: number;
  mainDbName: string;
}): Promise<PdfIndexStatus> => {
  return await invoke("pdf-index:status", params);
};

/** 批量查询索引状态；没有索引库的 PDF 不在结果里 */
export const getPdfIndexStatuses = async (params: {
  pdfIds: number[];
  mainDbName: string;
}): Promise<PdfIndexStatus[]> => {
  return await invoke("pdf-index:status-batch", params);
};

export const searchPdfContent = async (params: {
  pdfId: number;
  mainDbName: string;
  query: string;
  limit?: number;
}): Promise<PdfSearchResult[]> => {
  return await invoke("pdf-index:search", params);
};

export const getPdfDocumentInfo = async (params: {
  pdfId: number;
  mainDbName: string;
}): Promise<PdfDocumentInfo> => {
  return await invoke("pdf-index:document-info", params);
};

export const getPdfPageContent = async (params: {
  pdfId: number;
  mainDbName: string;
  pageNumber: number;
}): Promise<PdfPageContent | null> => {
  return await invoke("pdf-index:page-content", params);
};

export const getPdfPageRangeContent = async (params: {
  pdfId: number;
  mainDbName: string;
  startPage: number;
  endPage: number;
}): Promise<PdfPageContent[]> => {
  return await invoke("pdf-index:page-range-content", params);
};

export const getPdfOutline = async (params: {
  pdfId: number;
  mainDbName: string;
}): Promise<PdfOutlineNode[]> => {
  return await invoke("pdf-index:outline", params);
};

export const getPdfDocumentMap = async (params: {
  pdfId: number;
  mainDbName: string;
  depth?: number;
}): Promise<PdfDocumentMap> => {
  return await invoke("pdf-index:document-map", params);
};

export const readPdfSection = async (params: {
  pdfId: number;
  mainDbName: string;
  sectionId: string;
}): Promise<PdfSectionDetail | null> => {
  return await invoke("pdf-index:section-detail", params);
};
