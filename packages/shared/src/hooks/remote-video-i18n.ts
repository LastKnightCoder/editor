import { createI18nRuntime, createLocaleStore, defineI18n } from "@tau/i18n";
import { useI18n, useI18nRuntime } from "@tau/i18n/react";
import zhCN from "./locales/remote-video.zh-CN.json";
import zhTW from "./locales/remote-video.zh-TW.json";
import enUS from "./locales/remote-video.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
const standalone = createI18nRuntime({ localeSource: createLocaleStore("zh-CN") });
export function useRemoteVideoI18n() {
  return useI18n(messages, useI18nRuntime() ?? standalone);
}
