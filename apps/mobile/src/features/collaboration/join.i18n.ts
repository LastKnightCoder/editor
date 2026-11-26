import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import { mapErrorToMessage, parseInvokeError } from "../../services/errors";
import zhCN from "./locales/join.zh-CN.json";
import zhTW from "./locales/join.zh-TW.json";
import enUS from "./locales/join.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const joinTranslator = mobileI18n.get(messages);
export function useJoinCollaborationI18n() {
  return useI18n(messages, mobileI18n);
}
export function joinFailureText(error: unknown): string {
  const { code } = parseInvokeError(error);
  const diagnostic =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return mapErrorToMessage(code, diagnostic || joinTranslator.t("failed"));
}
