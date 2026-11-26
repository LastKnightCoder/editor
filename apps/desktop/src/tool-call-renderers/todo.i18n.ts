import { defineI18n, type Translator } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/todo.zh-CN.json";
import zhTW from "./locales/todo.zh-TW.json";
import enUS from "./locales/todo.en-US.json";
export const todoToolMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type TodoToolTranslate = Translator<Parameters<typeof todoToolMessages.ref>[0]>["t"];
export type TodoToolMessageKey = Parameters<typeof todoToolMessages.ref>[0];
export function useTodoToolI18n() {
  return useI18n(todoToolMessages, desktopI18n);
}
