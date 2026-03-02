import { invoke } from "@/electron";
import type { PdfExportPayload, PdfExportResult } from "@/types";

export const exportPdfWithDialog = async (
  payload: PdfExportPayload,
): Promise<PdfExportResult> => {
  return await invoke("export-pdf-with-dialog", payload);
};
