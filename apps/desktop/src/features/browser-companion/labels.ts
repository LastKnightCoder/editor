import type { CompanionScope } from "@tau/shared/browser-companion";
import type { BrowserClientRejection } from "@/types/browser-companion";
import type { BrowserCompanionTranslator } from "./i18n";

export function companionScopeMeta(scope: CompanionScope, t: BrowserCompanionTranslator) {
  return { label: t(`scope.${scope}.label`), detail: t(`scope.${scope}.detail`) };
}

export const clientLabel = (info: { browser: string; os: string }) =>
  info.os ? `${info.browser} · ${info.os}` : info.browser;

export function rejectionText(item: BrowserClientRejection, t: BrowserCompanionTranslator) {
  if (item.reasonCode === "closed" || item.reasonCode === "denied")
    return t(`reason.${item.reasonCode}`);
  return item.reason;
}

export function formatClientTime(
  time: number,
  locale: string,
  t: BrowserCompanionTranslator,
  now = Date.now()
) {
  const minutes = Math.round((now - time) / 60_000);
  if (minutes < 1) return t("time.now");
  if (minutes < 60)
    return t("time.minutes", { count: minutes, value: minutes.toLocaleString(locale) });
  if (minutes < 60 * 24) {
    const hours = Math.round(minutes / 60);
    return t("time.hours", { count: hours, value: hours.toLocaleString(locale) });
  }
  return new Date(time).toLocaleDateString(locale);
}
