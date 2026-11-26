import { defineI18n, type Translator, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/assistant.zh-CN.json";
import zhTW from "./locales/assistant.zh-TW.json";
import enUS from "./locales/assistant.en-US.json";
export const assistantToolMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const assistantToolTranslator = desktopI18n.get(assistantToolMessages);
export type AssistantToolTranslate = Translator<
  Parameters<typeof assistantToolMessages.ref>[0]
>["t"];
export function useAssistantToolI18n() {
  return useI18n(assistantToolMessages, desktopI18n);
}
export function assistantFeedback(
  key: Parameters<AssistantToolTranslate>[0],
  values?: TranslationValues
) {
  const parameters = values && Object.freeze({ ...values });
  const getMessage = () => assistantToolTranslator.t(key, parameters);
  return [getMessage(), { getMessage }] as const;
}
export function assistantFailure(key: Parameters<AssistantToolTranslate>[0], rawMessage?: string) {
  const getMessage = () => rawMessage ?? assistantToolTranslator.t(key);
  return [getMessage(), { getMessage }] as const;
}
