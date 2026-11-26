import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../../services/i18n";
import { formatListTime } from "../../../utils/contentTime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const mobileEditorMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type MobileEditorMessageKey = Parameters<typeof mobileEditorMessages.ref>[0];
export const mobileEditorTranslator = mobileI18n.get(mobileEditorMessages);
export function useMobileEditorI18n() {
  return useI18n(mobileEditorMessages, mobileI18n);
}
export function EditorText({ message }: { message: MobileEditorMessageKey }) {
  return useMobileEditorI18n().t(message);
}
export function editorTime(ts: number, locale = mobileI18n.getSnapshot()): string {
  return formatListTime(ts, locale, time => mobileEditorTranslator.t("time.yesterday", { time }));
}
export function editorAliases(key: MobileEditorMessageKey): string[] {
  return Object.values(mobileEditorMessages.resources)
    .map(resource => resource[key])
    .filter(Boolean);
}
