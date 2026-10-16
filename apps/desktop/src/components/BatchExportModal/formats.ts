import type { BatchExportSettings } from "@/types";

export type FormatKey = keyof BatchExportSettings["formats"];

interface FormatOption {
  key: FormatKey;
  label: string;
  /** 文件图标上的角标 */
  badge: string;
  description: string;
}

export const FORMAT_OPTIONS: FormatOption[] = [
  { key: "pdf", label: "PDF", badge: "PDF", description: "打印与分享，带书签目录" },
  { key: "epub", label: "EPUB", badge: "EPUB", description: "电子书，阅读器里翻页" },
  { key: "markdown", label: "Markdown", badge: "MD", description: "合并成一个文件，图片随包" },
  { key: "markdownZip", label: "Markdown 包", badge: "ZIP", description: "按目录逐篇，含图片附件" },
];
