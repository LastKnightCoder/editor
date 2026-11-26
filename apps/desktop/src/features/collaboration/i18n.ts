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
export type CollaborationMessageKey = Parameters<typeof messages.ref>[0];
export const collaborationTranslator = desktopI18n.get(messages);
export function useCollaborationI18n() {
  return useI18n(messages, desktopI18n);
}
export function collaborationFailureText(
  error: unknown,
  fallback: CollaborationMessageKey
): string {
  const diagnostic =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return diagnostic || collaborationTranslator.t(fallback);
}
