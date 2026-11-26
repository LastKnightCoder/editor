import { createI18nRuntime, createLocaleStore } from "@tau/i18n";

export const desktopLocaleSource = createLocaleStore("zh-CN");
export const desktopI18n = createI18nRuntime({ localeSource: desktopLocaleSource });
