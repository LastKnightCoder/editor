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

export function removeReadingFont(id: string) {
  return invoke<void>("reading_font_remove", { id });
}

export function readReadingFontFile(id: string, style: string) {
  return invoke<ArrayBuffer>("reading_font_read", { id, style });
}

export function fontTotalSize(font: ReadingFontRelease): number {
  return font.files.reduce((sum, file) => sum + file.size, 0);
}

const ERROR_MESSAGES: Record<string, string> = {
  READING_FONT_NETWORK: "网络连接失败，请稍后重试",
  READING_FONT_MANIFEST_INVALID: "字体信息暂不可用，请稍后重试",
  READING_FONT_NOT_FOUND: "该字体暂不可下载",
  READING_FONT_CORRUPT: "字体文件校验未通过，请重新下载",
  READING_FONT_STORAGE: "无法保存字体，请检查存储空间",
  READING_FONT_BUSY: "已有字体正在下载",
};

export function readingFontErrorMessage(error: unknown): string {
  return ERROR_MESSAGES[parseInvokeError(error).code] ?? "下载失败，请稍后重试";
}

export function isReadingFontCancelled(error: unknown): boolean {
  return parseInvokeError(error).code === "READING_FONT_CANCELLED";
}
