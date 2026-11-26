import type { TranslationValues } from "@tau/i18n";
import type { PdfAnnotation } from "@/types";
import { annotationPage, annotationText, type PdfQuote } from "./reader/annotationModel";
import type { PdfMessageKey } from "./i18n";

export function createPdfFormatting(
  locale: string,
  t: (key: PdfMessageKey, values?: TranslationValues) => string
) {
  const numbers = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 });
  const number = (value: number) => numbers.format(value);
  const dates = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" });
  const fullDates = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  return {
    number,
    day(ts: number | null, now = new Date()) {
      if (!ts) return "—";
      const date = new Date(ts);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
      if (diff <= 0) return t("date.today");
      if (diff === 1) return t("date.yesterday");
      if (diff < 7) return t("date.daysAgo", { days: number(diff) });
      return (date.getFullYear() === now.getFullYear() ? dates : fullDates).format(date);
    },
    annotationSnippet(record: PdfAnnotation) {
      const page = number(annotationPage(record));
      if (record.type === "area") return t("annotation.areaSnippet", { page });
      if (record.type === "margin") return t("annotation.marginSnippet", { page });
      return annotationText(record.annotation) || t("annotation.pageSnippet", { page });
    },
    quoteSource(quote: PdfQuote) {
      return t("quote.source", {
        page: number(quote.pageNumber),
        kind: t(`quote.kind.${quote.kind}`),
      });
    },
  };
}
