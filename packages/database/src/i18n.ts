import { createI18nRuntime, createLocaleStore, defineI18n } from "@tau/i18n";
import { useI18n, useI18nRuntime } from "@tau/i18n/react";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});

const standaloneRuntime = createI18nRuntime({ localeSource: createLocaleStore("zh-CN") });

export type DatabaseMessageKey = keyof typeof zhCN;

/** 词典翻译函数：只在渲染或动作闭包里调用；透传给纯函数（公式复述、校验文案） */
export type DatabaseT = (
  key: DatabaseMessageKey,
  values?: Record<string, string | number | boolean>
) => string;

export function useDatabaseI18n() {
  const inherited = useI18nRuntime();
  return useI18n(messages, inherited ?? standaloneRuntime);
}

/** 中文兜底翻译：渲染层之外的纯函数（日期展示等）缺省用它，宿主词典接入后由调用方透传 t */
export const databaseFallbackT: DatabaseT = (key, values) =>
  standaloneRuntime.get(messages).t(key, values);

const fallbackMessages: Record<string, string> = messages.resources["zh-CN"];
const hasMessage = (key: string): key is DatabaseMessageKey => Object.hasOwn(fallbackMessages, key);

/** 内置视图类型在注册表里以中文登记（数据）；渲染时优先词典投影，扩展视图回退注册值 */
export function viewTypeText(
  t: DatabaseT,
  type: string,
  field: "name" | "unavailable" | "columnLabel" | "columnPlaceholder",
  fallback: string
): string {
  const key = field === "name" ? `view.type.${type}.name` : `view.required.${type}.${field}`;
  return hasMessage(key) ? t(key) : fallback;
}

/** 内置字段类型的插件名同理：词典优先，扩展插件回退其注册名 */
export function pluginDisplayName(t: DatabaseT, type: string, fallback: string): string {
  const key = `plugin.${type}.name`;
  return hasMessage(key) ? t(key) : fallback;
}
