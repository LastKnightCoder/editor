import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import { mapErrorToMessage } from "../../services/errors";
import zhCN from "./locales/history.zh-CN.json";
import zhTW from "./locales/history.zh-TW.json";
import enUS from "./locales/history.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type HistoryKey = Parameters<typeof messages.ref>[0];
export type HistoryLocale = {
  locale: string;
  t(key: HistoryKey, values?: TranslationValues): string;
};
export type HistoryIssue = { cause: unknown; fallback: HistoryKey };
export function useHistoryI18n() {
  return useI18n(messages, mobileI18n);
}
const ERROR_KEYS: Partial<Record<string, HistoryKey>> = {
  INVALID_HISTORY_ACTION: "error.invalidAction",
  INVALID_HISTORY_VERSION: "error.invalidVersion",
  HISTORY_NOT_FOUND: "error.notFound",
  HISTORY_INCOMPLETE: "error.incomplete",
  HISTORY_CAPACITY: "error.capacity",
  HISTORY_IDENTITY_CONFLICT: "error.identity",
  CONTENT_VERSION_CONFLICT: "error.revision",
  SCOPE_CONFLICT: "error.scope",
  FORBIDDEN: "error.forbidden",
  UI_HISTORY_DOCUMENT_UNAVAILABLE: "error.documentUnavailable",
  UI_HISTORY_SYNC_PENDING: "error.syncPending",
};
export function historyErrorText({ cause, fallback }: HistoryIssue, { t }: HistoryLocale): string {
  const message = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  const code =
    cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string"
      ? cause.code
      : /^([A-Z][A-Z_]+):/.exec(message.replace(/^Error:\s*/, ""))?.[1];
  const key = code && Object.hasOwn(ERROR_KEYS, code) ? ERROR_KEYS[code] : undefined;
  return key
    ? t(key)
    : code
      ? mapErrorToMessage(code, message || t(fallback))
      : message || t(fallback);
}
