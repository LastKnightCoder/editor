import { invoke } from "@/electron";
import {
  Pdf,
  PdfAnnotation,
  CreatePdfAnnotation,
  PdfBookmark,
  CreatePdfBookmark,
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
