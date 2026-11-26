import { createI18nRuntime, createLocaleStore, defineI18n } from "@tau/i18n";
import { resolveAppLocale } from "@tau/shared/language";
import { getMobileSettingSnapshot, subscribeMobileSettingSnapshot } from "./mobileSettingsBridge";
import zhCN from "../locales/zh-CN.json";
import zhTW from "../locales/zh-TW.json";
import enUS from "../locales/en-US.json";

export const mobileLocaleSource = createLocaleStore("zh-CN");
export const mobileI18n = createI18nRuntime({ localeSource: mobileLocaleSource });
export const mobileMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});

export type MobileMessageKey = Parameters<typeof mobileMessages.ref>[0];
export const mobileTranslator = mobileI18n.get(mobileMessages);

export function connectMobileI18n() {
  const update = () => {
    const locale = resolveAppLocale(getMobileSettingSnapshot()?.language, navigator.language);
    mobileLocaleSource.setLocale(locale);
    document.documentElement.lang = locale;
  };
  const stop = subscribeMobileSettingSnapshot(update);
  window.addEventListener("languagechange", update);
  update();
  return () => {
    stop();
    window.removeEventListener("languagechange", update);
  };
}
