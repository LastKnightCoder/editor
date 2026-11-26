import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/ui.zh-CN.json";
import zhTW from "./locales/ui.zh-TW.json";
import enUS from "./locales/ui.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const queryUiTranslator = desktopI18n.get(messages);
export function useQueryUiI18n() {
  return useI18n(messages, desktopI18n);
}
export function queryUiErrorText(error: unknown, includeName = false): string {
  if (error && typeof error === "object" && "code" in error) {
    switch (error.code) {
      case "QUERY_SOURCE_OPEN_UNSUPPORTED":
        return queryUiTranslator.t("error.openUnsupported");
      case "QUERY_SAVE_IN_PROGRESS":
        return queryUiTranslator.t("error.saving");
      case "QUERY_DATABASE_NOT_FOUND":
        return queryUiTranslator.t("error.notFound");
    }
  }
  return error instanceof Error && !includeName ? error.message : String(error);
}
