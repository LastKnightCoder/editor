import {
  createI18nRuntime,
  createLocaleStore,
  defineI18n,
  resolveLocale,
  type Translator,
} from "@tau/i18n";
import zhCN from "./locales/date.zh-CN.json";
import zhTW from "./locales/date.zh-TW.json";
import enUS from "./locales/date.en-US.json";
export const dateMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
type DateTranslator = Translator<Parameters<typeof dateMessages.ref>[0]>;
const locales = Object.keys(dateMessages.resources);
const translators: Record<string, DateTranslator> = Object.fromEntries(
  locales.map(locale => [
    locale,
    createI18nRuntime({ localeSource: createLocaleStore(locale) }).get(dateMessages),
  ])
);
export function getDateTranslator(locale: string): DateTranslator {
  return translators[resolveLocale(locale, locales, dateMessages.fallbackLocale)];
}
