import { app } from "electron";
import {
  createI18nRuntime,
  createLocaleStore,
  defineI18n,
  type TranslationValues,
} from "@tau/i18n";
import { resolveAppLocale } from "@tau/shared/language";
import log from "electron-log";
import userSettingModule from "./user-setting";
import zhCN from "../locales/notifications.zh-CN.json";
import zhTW from "../locales/notifications.zh-TW.json";
import enUS from "../locales/notifications.en-US.json";

/**
 * 主进程通知载荷的界面语言：随用户设置缓存一份，发送通知的模块在创建时读取当前值。
 * 通知载荷是创建时点的字符串快照，语言变化不重发已发出的通知。
 */

const notificationMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});

const localeSource = createLocaleStore("zh-CN");
const runtime = createI18nRuntime({ localeSource });
const translator = runtime.get(notificationMessages);

export function initNotificationLocale(): void {
  const apply = (language: unknown) =>
    localeSource.setLocale(resolveAppLocale(language, app.getLocale()));
  void userSettingModule
    .getSettingSnapshot()
    .then(setting => apply(setting.language))
    .catch(error => log.warn("[notification-locale] 读取界面语言失败", error));
  userSettingModule.onSettingChanged(({ newSetting }) => apply(newSetting.language));
}

/** 当前通知语言快照：供接收显式 locale 的纯 formatter 使用。 */
export function notificationLocale(): string {
  return localeSource.getSnapshot();
}

export function notificationT(
  key: Parameters<typeof translator.t>[0],
  values?: TranslationValues
): string {
  return translator.t(key, values);
}
