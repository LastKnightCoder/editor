import { createI18nRuntime, createLocaleStore, defineI18n } from "@tau/i18n";
import { useI18n, useI18nRuntime } from "@tau/i18n/react";
import zhCN from "../../../locales/syntax-highlighter.zh-CN.json" with { type: "json" };
import zhTW from "../../../locales/syntax-highlighter.zh-TW.json" with { type: "json" };
import enUS from "../../../locales/syntax-highlighter.en-US.json" with { type: "json" };

const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});

const standaloneRuntime = createI18nRuntime({ localeSource: createLocaleStore("zh-CN") });

export function useSyntaxHighlighterI18n() {
  const inherited = useI18nRuntime();
  return useI18n(messages, inherited ?? standaloneRuntime);
}
