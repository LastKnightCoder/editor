import { createI18nRuntime, createLocaleStore, defineI18n, resolveLocale } from "@tau/i18n";
import zhCN from "../../locales/core.zh-CN.json" with { type: "json" };
import zhTW from "../../locales/core.zh-TW.json" with { type: "json" };
import enUS from "../../locales/core.en-US.json" with { type: "json" };

export interface TextFieldInputFailure {
  code: "draft-preserved";
  cause: unknown;
}

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

export function formatTextFieldInputFailure(
  failure: TextFieldInputFailure,
  locale = "zh-CN"
): string {
  const t = translators[resolveLocale(locale, locales, messages.fallbackLocale)].t;
  return t("core.source.draftPreserved", {
    reason: failure.cause instanceof Error ? failure.cause.message : t("core.source.syncFailed"),
  });
}
