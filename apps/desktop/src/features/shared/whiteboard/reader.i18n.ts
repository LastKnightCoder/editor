import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import dayjs from "dayjs";
import type { DocumentKind } from "@tau/whiteboard";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/reader.zh-CN.json";
import zhTW from "./locales/reader.zh-TW.json";
import enUS from "./locales/reader.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const documentReaderTranslator = desktopI18n.get(messages);
export function useDocumentReaderI18n() {
  return useI18n(messages, desktopI18n);
}
export function documentKindLabel(
  kind: DocumentKind,
  { t }: Pick<ReturnType<typeof useDocumentReaderI18n>, "t">
): string {
  return t(`kind.${kind}`);
}
export function readerMomentDay(day: string, locale: string): string {
  const value = dayjs(day);
  return value.isValid()
    ? new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      }).format(value.toDate())
    : value.format();
}
export function readerMomentTime(time: number, locale: string): string {
  const value = dayjs(time);
  return value.isValid()
    ? new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(value.toDate())
    : value.format();
}
