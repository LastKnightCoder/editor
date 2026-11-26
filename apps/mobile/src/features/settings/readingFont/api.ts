// 正文字体命令封装，实现见 src-tauri/src/reading_font.rs

import { Channel, invoke } from "@tauri-apps/api/core";
import { parseInvokeError } from "../../../services/errors";

export type ReadingFontFile = {
  style: string;
  /** CSS font-weight 描述符：`400` 或可变字体区间 `200 900` */
  weight: string;
  file: string;
  size: number;
  sha256: string;
};

export type ReadingFontRelease = {
  id: string;
  name: string;
  version: string;
  license: string;
  files: ReadingFontFile[];
};

export type ReadingFontProgress = { received: number; total: number };

export function fetchReadingFontCatalog() {
  return invoke<ReadingFontRelease[]>("reading_font_catalog");
}

export function listInstalledReadingFonts() {
  return invoke<ReadingFontRelease[]>("reading_font_installed");
}

export function downloadReadingFont(
  id: string,
  onProgress: (progress: ReadingFontProgress) => void
) {
  const channel = new Channel<ReadingFontProgress>();
  channel.onmessage = onProgress;
  return invoke<ReadingFontRelease>("reading_font_download", { id, onProgress: channel });
}

export function cancelReadingFontDownload() {
  return invoke<void>("reading_font_cancel_download");
}

export function readReadingFontFile(id: string, style: string) {
  return invoke<ArrayBuffer>("reading_font_read", { id, style });
}

export function fontTotalSize(font: ReadingFontRelease): number {
  return font.files.reduce((sum, file) => sum + file.size, 0);
}

export function isReadingFontCancelled(error: unknown): boolean {
  return parseInvokeError(error).code === "READING_FONT_CANCELLED";
}
