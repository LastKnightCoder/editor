import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n as runtime } from "@/app/i18n/runtime";
import { createPdfFormatting } from "./format";
import { pdfTitle } from "./model";
import type { PdfAnnotation } from "@/types";
import type { PdfQuote } from "./reader/annotationModel";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const pdfMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type PdfMessageKey = Parameters<typeof pdfMessages.ref>[0];
export const pdfTranslator = runtime.get(pdfMessages);
export const pdfText = pdfTranslator.t;
export function usePdfI18n() {
  return useI18n(pdfMessages, runtime);
}
const formats = new Map<string, ReturnType<typeof createPdfFormatting>>();
function format() {
  const locale = runtime.getSnapshot();
  let value = formats.get(locale);
  if (!value) {
    value = createPdfFormatting(locale, pdfText);
    formats.set(locale, value);
  }
  return value;
}
export const pdfValue = (value: unknown) =>
  typeof value === "number" ? format().number(value) : String(value);
export const pdfFileTitle = (fileName: string) => pdfTitle(fileName, pdfText("fallback.pdfTitle"));
export const pdfFormat = {
  day: (ts: number | null, now = new Date()) => format().day(ts, now),
  annotationSnippet: (record: PdfAnnotation) => format().annotationSnippet(record),
  quoteSource: (quote: PdfQuote) => format().quoteSource(quote),
};
