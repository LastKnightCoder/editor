import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
export const todosMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const todosTranslator = desktopI18n.get(todosMessages);
export function useTodosI18n() {
  return useI18n(todosMessages, desktopI18n);
}

export type TodosMessageKey = Parameters<typeof todosMessages.ref>[0];
export function todosNumber(value: number): string {
  return value.toLocaleString(desktopI18n.getSnapshot());
}
export function todosCount(
  key: TodosMessageKey,
  count: number,
  values: TranslationValues = {}
): string {
  return todosTranslator.t(key, { ...values, count, amount: todosNumber(count) });
}
