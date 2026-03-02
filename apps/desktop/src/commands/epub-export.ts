import { invoke } from "@/electron";
import type { EpubExportPayload, EpubExportResult } from "@/types";

export const exportEpubWithDialog = async (
  payload: EpubExportPayload,
): Promise<EpubExportResult> => {
  return await invoke("export-epub-with-dialog", payload);
};
