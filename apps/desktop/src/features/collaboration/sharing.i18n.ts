import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/sharing.zh-CN.json";
import zhTW from "./locales/sharing.zh-TW.json";
import enUS from "./locales/sharing.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const sharingTranslator = desktopI18n.get(messages);
export function useSharingI18n() {
  return useI18n(messages, desktopI18n);
}
export function sharingFailureText(error: unknown): string {
  const diagnostic =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return diagnostic || sharingTranslator.t("share.failed");
}
