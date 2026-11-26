import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
export const standaloneWhiteboardI18n = createI18nRuntime({
  localeSource: createLocaleStore("zh-CN"),
});
