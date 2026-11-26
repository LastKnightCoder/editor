import { createI18nRuntime, createLocaleStore, defineI18n, resolveLocale } from "@tau/i18n";
import zhCN from "./locales/sync-progress.zh-CN.json" with { type: "json" };
import zhTW from "./locales/sync-progress.zh-TW.json" with { type: "json" };
import enUS from "./locales/sync-progress.en-US.json" with { type: "json" };
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
const locales = Object.keys(messages.resources);
const translators = Object.fromEntries(
  locales.map(locale => [
    locale,
    createI18nRuntime({ localeSource: createLocaleStore(locale) }).get(messages),
  ])
);
export function databaseSyncDisplay(locale: string) {
  const resolved = resolveLocale(locale, locales, messages.fallbackLocale);
  return { locale: resolved, t: translators[resolved].t };
}
