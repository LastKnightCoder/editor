import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
export const aboutMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type AboutMessageKey = Parameters<typeof aboutMessages.ref>[0];
export type AboutLocale = {
  locale: string;
  t: (key: AboutMessageKey, values?: TranslationValues) => string;
};
export const aboutTranslator = desktopI18n.get(aboutMessages);
export function useAboutI18n() {
  return useI18n(aboutMessages, desktopI18n);
}
export function aboutDisplayContext() {
  return { locale: desktopI18n.getSnapshot(), t: aboutTranslator.t };
}
