import { exportTranslator } from "@/features/transfer/i18n-export";
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
  {
    key: "pdf",
    get label() {
      return exportTranslator.t("format.pdf");
    },
    badge: "PDF",
    get description() {
      return exportTranslator.t("format.pdfHint");
    },
  },
  {
    key: "epub",
    get label() {
      return exportTranslator.t("format.epub");
    },
    badge: "EPUB",
    get description() {
      return exportTranslator.t("format.epubHint");
    },
  },
  {
    key: "markdown",
    get label() {
      return exportTranslator.t("format.markdown");
    },
    badge: "MD",
    get description() {
      return exportTranslator.t("format.markdownHint");
    },
  },
  {
    key: "markdownZip",
    get label() {
      return exportTranslator.t("format.markdownZip");
    },
    badge: "ZIP",
    get description() {
      return exportTranslator.t("format.markdownZipHint");
    },
  },
];
