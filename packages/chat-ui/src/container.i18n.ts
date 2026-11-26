import { createI18nRuntime, createLocaleStore, defineI18n } from "@tau/i18n";
import { useI18n, useI18nRuntime } from "@tau/i18n/react";
import zhCN from "./locales/container.zh-CN.json";
import zhTW from "./locales/container.zh-TW.json";
import enUS from "./locales/container.en-US.json";
export const containerMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
const standalone = createI18nRuntime({ localeSource: createLocaleStore("zh-CN") });
export function useChatContainerI18n() {
  return useI18n(containerMessages, useI18nRuntime() ?? standalone);
}
