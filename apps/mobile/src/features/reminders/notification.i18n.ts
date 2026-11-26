import { createI18nRuntime, createLocaleStore, defineI18n, resolveLocale } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import type { NotifyEntry, NotifyUi, NotifyUiChannels } from "./native";
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

export function notificationEntryUi(
  entry: Pick<NotifyEntry, "kind" | "detail">,
  locale: string,
  snoozeMinutes: number
): NotifyUi {
  const resolved = resolveLocale(locale, locales, messages.fallbackLocale);
  const { t } = notificationSnapshot(resolved);
  return {
    locale: resolved,
    snoozeMinutes,
    kindLabel: t(`kind.${entry.kind}`),
    completeLabel: t("complete"),
    ackLabel: t("native.ack"),
    snoozeLabel: t("snooze.action", { count: snoozeMinutes }),
    snoozedBody: entry.detail
      ? t("native.snoozedDetail", { detail: entry.detail })
      : t("native.snoozed"),
  };
}

export function notificationChannelUi(locale: string): NotifyUiChannels {
  const { t } = notificationSnapshot(locale);
  return {
    todo: {
      name: t("native.channel.todo.name"),
      description: t("native.channel.todo.description"),
    },
    event: {
      name: t("native.channel.event.name"),
      description: t("native.channel.event.description"),
    },
    pomodoro: {
      name: t("native.channel.pomodoro.name"),
      description: t("native.channel.pomodoro.description"),
    },
  };
}
