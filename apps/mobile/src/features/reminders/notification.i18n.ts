import { createI18nRuntime, createLocaleStore, defineI18n, resolveLocale } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import zhCN from "./locales/notification.zh-CN.json";
import zhTW from "./locales/notification.zh-TW.json";
import enUS from "./locales/notification.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const notificationTranslator = mobileI18n.get(messages);
export function useNotificationI18n() {
  return useI18n(messages, mobileI18n);
}
const locales = Object.keys(messages.resources);
const translators = Object.fromEntries(
  locales.map(locale => [
    locale,
    createI18nRuntime({ localeSource: createLocaleStore(locale) }).get(messages),
  ])
);
export function notificationSnapshot(locale: string) {
  return translators[resolveLocale(locale, locales, messages.fallbackLocale)];
}
export type NotifyPermissionIssue = { kind: "read" | "request" | "settings"; cause: unknown };
export function notifyPermissionIssueText(issue: NotifyPermissionIssue): string {
  if (issue.cause instanceof Error && issue.cause.message) return issue.cause.message;
  if (typeof issue.cause === "string" && issue.cause) return issue.cause;
  return notificationTranslator.t(`permission.${issue.kind}`);
}
