import { contentTransferErrorText } from "@/services/content-transfer.i18n";
import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/export.zh-CN.json";
import zhTW from "./locales/export.zh-TW.json";
import enUS from "./locales/export.en-US.json";
export const exportMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type ExportMessageKey = Parameters<typeof exportMessages.ref>[0];
export const exportTranslator = desktopI18n.get(exportMessages);
export const getExportLocale = desktopI18n.getSnapshot;
export function useExportI18n() {
  return useI18n(exportMessages, desktopI18n);
}
export function exportErrorReason(error: unknown): string {
  if (error instanceof Error && "code" in error && error.code === "EXPORT_CONTENT_MISSING")
    return exportTranslator.t("error.missingContent");
  return contentTransferErrorText(error);
}
