import { createI18nRuntime, createLocaleStore, defineI18n } from "@tau/i18n";
import { useI18n, useI18nRuntime } from "@tau/i18n/react";
import zhCN from "../../../locales/chat-composer.zh-CN.json" with { type: "json" };
import zhTW from "../../../locales/chat-composer.zh-TW.json" with { type: "json" };
import enUS from "../../../locales/chat-composer.en-US.json" with { type: "json" };

const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});

const standaloneRuntime = createI18nRuntime({ localeSource: createLocaleStore("zh-CN") });

export function useChatComposerI18n() {
  const inherited = useI18nRuntime();
  return useI18n(messages, inherited ?? standaloneRuntime);
}
