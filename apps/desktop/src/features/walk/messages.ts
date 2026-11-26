import { defineI18n, type TranslationValues } from "@tau/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const walkMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type WalkMessageKey = Parameters<typeof walkMessages.ref>[0];
export interface WalkLocale {
  locale: string;
  t(key: WalkMessageKey, values?: TranslationValues): string;
}
