import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { extensionI18n } from "../shared/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const noteTranslator = extensionI18n.get(messages);
export function useNoteI18n() {
  return useI18n(messages, extensionI18n);
}
export function noteErrorText(
  error: unknown,
  fallback: Parameters<typeof messages.ref>[0]
): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "NOTE_DRAFT_UNSUPPORTED"
  )
    return noteTranslator.t("unsupportedDraft");
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message || noteTranslator.t(fallback);
}
