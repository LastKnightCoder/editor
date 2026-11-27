import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const chatRefTranslator = desktopI18n.get(messages);
export function useChatRefI18n() {
  return useI18n(messages, desktopI18n);
}
export function chatRefFailureText(
  cause: unknown,
  fallback: "read.failed" | "open.failed" | "copy.failed" | "reference.failed"
): string {
  if (
    cause &&
    typeof cause === "object" &&
    "code" in cause &&
    cause.code === "CHAT_REF_READ_FAILED"
  )
    return chatRefTranslator.t("read.failed");
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string" && cause) return cause;
  return chatRefTranslator.t(fallback);
}
