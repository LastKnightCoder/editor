import { invoke } from "@/electron";
import { Pdf, PdfHighlight } from "@/types";

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

export const addPdfHighlight = async (
  highlight: Omit<PdfHighlight, "id" | "createTime" | "updateTime">,
): Promise<PdfHighlight> => {
  return await invoke("add-pdf-highlight", highlight);
};

export const updatePdfHighlight = async (
  highlight: PdfHighlight,
): Promise<PdfHighlight> => {
  return await invoke("update-pdf-highlight", highlight);
};

export const getPdfHighlightById = async (
  id: number,
): Promise<PdfHighlight> => {
  return await invoke("get-pdf-highlight-by-id", id);
};

export const getPdfHighlights = async (
  pdfId: number,
): Promise<PdfHighlight[]> => {
  return await invoke("get-pdf-highlights", pdfId);
};

export const removePdfHighlight = async (id: number): Promise<number> => {
  return await invoke("delete-pdf-highlight", id);
};
