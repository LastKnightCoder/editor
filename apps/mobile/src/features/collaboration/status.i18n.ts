import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import type { SessionStatus } from "@tau/collaboration/src/view";
import { mobileI18n } from "../../services/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type CollaborationUiKey = Parameters<typeof messages.ref>[0];
export type CollaborationUiLocale = {
  locale: string;
  t(key: CollaborationUiKey, values?: TranslationValues): string;
};
export const collaborationUiTranslator = mobileI18n.get(messages);
export function useCollaborationStatusI18n() {
  return useI18n(messages, mobileI18n);
}
export function sessionStatusText(status: SessionStatus, { t }: CollaborationUiLocale): string {
  return status.kind === "error" ? status.error || t("status.error") : t(`status.${status.kind}`);
}
