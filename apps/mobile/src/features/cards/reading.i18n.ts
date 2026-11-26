import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import type { OutlineRow } from "./outline/outlineModel";
import zhCN from "./locales/reading.zh-CN.json";
import zhTW from "./locales/reading.zh-TW.json";
import enUS from "./locales/reading.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const readingTranslator = mobileI18n.get(messages);
export function useReadingI18n() {
  return useI18n(messages, mobileI18n);
}
const EMPTY_TYPES = [
  "paragraph",
  "header",
  "check-list",
  "bulleted-list",
  "numbered-list",
  "blockquote",
  "callout",
  "detail",
  "highlight-block",
  "tabs",
  "image",
  "video",
  "audio",
  "webview",
  "block-math",
  "mermaid",
  "plantuml",
  "typst",
  "divide-line",
  "front-matter",
] as const;
type EmptyType = (typeof EMPTY_TYPES)[number];
function isEmptyType(type: string): type is EmptyType {
  return (EMPTY_TYPES as readonly string[]).includes(type);
}
export function outlineRowText(
  row: OutlineRow,
  { t }: Pick<ReturnType<typeof useReadingI18n>, "t">
): string {
  if (row.type === "table") return t("outline.table", { count: row.tableRows ?? 0 });
  if (row.text) return row.text;
  if (row.type === "code-block")
    return row.language ? t("outline.codeLanguage", { language: row.language }) : t("outline.code");
  return isEmptyType(row.type) ? t(`outline.empty.${row.type}`) : t("outline.block");
}
