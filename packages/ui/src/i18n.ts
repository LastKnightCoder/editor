import { createI18nRuntime, createLocaleStore, defineI18n } from "@tau/i18n";
import { useI18n, useI18nRuntime } from "@tau/i18n/react";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});

const standaloneRuntime = createI18nRuntime({ localeSource: createLocaleStore("zh-CN") });

export function useUiI18n() {
  const inherited = useI18nRuntime();
  return useI18n(messages, inherited ?? standaloneRuntime);
}
