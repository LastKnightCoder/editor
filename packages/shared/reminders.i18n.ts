import {
  createI18nRuntime,
  createLocaleStore,
  defineI18n,
  resolveLocale,
  type Translator,
} from "@tau/i18n";
import zhCN from "./locales/reminders.zh-CN.json" with { type: "json" };
import zhTW from "./locales/reminders.zh-TW.json" with { type: "json" };
import enUS from "./locales/reminders.en-US.json" with { type: "json" };

export const reminderMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type ReminderMessageKey = Parameters<typeof reminderMessages.ref>[0];
export type ReminderTranslator = Translator<ReminderMessageKey>;
const locales = Object.keys(reminderMessages.resources);
const translators: Record<string, ReminderTranslator> = Object.fromEntries(
  locales.map(locale => [
    locale,
    createI18nRuntime({ localeSource: createLocaleStore(locale) }).get(reminderMessages),
  ])
);
export function getReminderTranslator(locale = "zh-CN"): ReminderTranslator {
  return translators[resolveLocale(locale, locales, reminderMessages.fallbackLocale)];
}
