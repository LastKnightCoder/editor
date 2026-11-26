import { resolveAppLocale } from "@tau/shared/language";
import dayjs from "dayjs";
import "dayjs/locale/zh-tw";
import useSettingStore from "@/stores/useSettingStore";
import { desktopLocaleSource } from "./runtime";

const DATE_LOCALES: Readonly<Record<string, string>> = {
  "zh-CN": "zh-cn",
  "zh-TW": "zh-tw",
  "en-US": "en",
};

export function connectDesktopI18n() {
  const update = () => {
    const locale = resolveAppLocale(
      useSettingStore.getState().setting.language,
      navigator.language
    );
    desktopLocaleSource.setLocale(locale);
    document.documentElement.lang = locale;
    dayjs.locale(DATE_LOCALES[locale] ?? "zh-cn");
  };
  const unsubscribe = useSettingStore.subscribe(update);
  window.addEventListener("languagechange", update);
  update();
  return () => {
    unsubscribe();
    window.removeEventListener("languagechange", update);
  };
}
