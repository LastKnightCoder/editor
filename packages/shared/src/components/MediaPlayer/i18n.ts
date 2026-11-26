import {
  createI18nRuntime,
  createLocaleStore,
  defineI18n,
  type TranslationValues,
} from "@tau/i18n";
import { useI18n, useI18nRuntime } from "@tau/i18n/react";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const mediaPlayerMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type MediaPlayerMessageKey = Parameters<typeof mediaPlayerMessages.ref>[0];
export type MediaOsdMessage = { key: MediaPlayerMessageKey; values?: TranslationValues };
const standalone = createI18nRuntime({ localeSource: createLocaleStore("zh-CN") });
export function useMediaPlayerI18n() {
  return useI18n(mediaPlayerMessages, useI18nRuntime() ?? standalone);
}
