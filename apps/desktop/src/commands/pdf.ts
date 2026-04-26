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
  PdfSectionSummary,
  PdfSectionDetail,
  PdfChatMessage,
  CreatePdfChat,
  UpdatePdfChat,
} from "@/types";

export const createPdf = async (
  pdf: Omit<Pdf, "id" | "createTime" | "updateTime">,
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

export const addPdfAnnotation = async (
  annotation: CreatePdfAnnotation,
): Promise<PdfAnnotation> => {
  return await invoke("add-pdf-annotation", annotation);
};

export const updatePdfAnnotation = async (
  annotation: PdfAnnotation,
): Promise<PdfAnnotation> => {
  return await invoke("update-pdf-annotation", annotation);
};

export const getPdfAnnotations = async (
  pdfId: number,
): Promise<PdfAnnotation[]> => {
  return await invoke("get-pdf-annotations", pdfId);
};

export const removePdfAnnotation = async (id: number): Promise<number> => {
  return await invoke("delete-pdf-annotation", id);
};

export const addPdfBookmark = async (
  bookmark: CreatePdfBookmark,
): Promise<PdfBookmark> => {
  return await invoke("add-pdf-bookmark", bookmark);
};

export const updatePdfBookmark = async (
  bookmark: PdfBookmark,
): Promise<PdfBookmark> => {
  return await invoke("update-pdf-bookmark", bookmark);
};

export const getPdfBookmarks = async (
  pdfId: number,
): Promise<PdfBookmark[]> => {
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

export const getPdfSectionSummary = async (params: {
  pdfId: number;
  mainDbName: string;
  sectionId: string;
}): Promise<PdfSectionSummary | null> => {
  return await invoke("pdf-index:section-summary", params);
};

export const searchPdfSections = async (params: {
  pdfId: number;
  mainDbName: string;
  query: string;
  limit?: number;
}): Promise<PdfSectionSummary[]> => {
  return await invoke("pdf-index:section-search", params);
};

export const readPdfSection = async (params: {
  pdfId: number;
  mainDbName: string;
  sectionId: string;
}): Promise<PdfSectionDetail | null> => {
  return await invoke("pdf-index:section-detail", params);
};

export const createPdfChat = async (
  params: CreatePdfChat,
): Promise<PdfChatMessage> => {
  return await invoke("pdf-chat:create", params);
};

export const updatePdfChat = async (
  params: UpdatePdfChat,
): Promise<PdfChatMessage | null> => {
  return await invoke("pdf-chat:update", params);
};

export const deletePdfChat = async (id: number): Promise<boolean> => {
  return await invoke("pdf-chat:delete", id);
};

export const getPdfChatById = async (
  id: number,
): Promise<PdfChatMessage | null> => {
  return await invoke("pdf-chat:get", id);
};

export const getPdfChatsByPdfId = async (
  pdfId: number,
): Promise<PdfChatMessage[]> => {
  return await invoke("pdf-chat:list-by-pdf-id", pdfId);
};

export const getPdfChatBranches = async (
  parentChatId: number,
): Promise<PdfChatMessage[]> => {
  return await invoke("pdf-chat:get-branches", parentChatId);
};

export const getPdfNextBranchIndex = async (
  parentChatId: number,
): Promise<number> => {
  return await invoke("pdf-chat:get-next-branch-index", parentChatId);
};

export const getPdfChildBranchesCount = async (
  parentChatId: number,
): Promise<number> => {
  return await invoke("pdf-chat:get-child-branches-count", parentChatId);
};
