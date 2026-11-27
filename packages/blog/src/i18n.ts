import { createI18nRuntime, createLocaleStore, defineI18n } from "@tau/i18n";
import { useI18n, useI18nRuntime } from "@tau/i18n/react";
import zhCN from "./locales/content.zh-CN.json" with { type: "json" };
import zhTW from "./locales/content.zh-TW.json" with { type: "json" };
import enUS from "./locales/content.en-US.json" with { type: "json" };

const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});

const standaloneRuntime = createI18nRuntime({ localeSource: createLocaleStore("zh-CN") });

export function useBlogI18n() {
  const inherited = useI18nRuntime();
  return useI18n(messages, inherited ?? standaloneRuntime);
}

/** 由站点提供的 locale 构建渲染运行时；ContentRenderer 提供 Provider。 */
export function createBlogLocaleRuntime(locale: string) {
  const localeSource = createLocaleStore(locale);
  return { runtime: createI18nRuntime({ localeSource }), setLocale: (next: string) => localeSource.setLocale(next) };
}
