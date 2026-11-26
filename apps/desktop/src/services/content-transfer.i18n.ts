import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/content-transfer.zh-CN.json";
import zhTW from "./locales/content-transfer.zh-TW.json";
import enUS from "./locales/content-transfer.en-US.json";
export const contentTransferMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const contentTransferTranslator = desktopI18n.get(contentTransferMessages);
export function useContentTransferI18n() {
  return useI18n(contentTransferMessages, desktopI18n);
}

export function contentTransferErrorText(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "CONTENT_EXPORT_NOT_FOUND")
      return contentTransferTranslator.t("export.missing");
    if (error.code === "CONTENT_FORMAT_UNSUPPORTED")
      return contentTransferTranslator.t("export.unsupported");
  }
  return error instanceof Error ? error.message : String(error);
}
