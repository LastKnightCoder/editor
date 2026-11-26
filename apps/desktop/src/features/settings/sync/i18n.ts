import { SyncOperationError } from "./errors";
import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
export const syncMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type SyncMessageKey = Parameters<typeof syncMessages.ref>[0];
export type SyncLocale = {
  locale: string;
  t(key: SyncMessageKey, values?: TranslationValues): string;
};
export const syncTranslator = desktopI18n.get(syncMessages);
export function useSyncI18n() {
  return useI18n(syncMessages, desktopI18n);
}
export function syncCount(key: SyncMessageKey, count: number, values: TranslationValues = {}) {
  return syncTranslator.t(key, {
    ...values,
    count,
    amount: count.toLocaleString(desktopI18n.getSnapshot()),
  });
}
export function syncDisplayContext(): SyncLocale {
  return { locale: desktopI18n.getSnapshot(), t: syncTranslator.t };
}

export function syncErrorText(error: unknown): string {
  if (error instanceof SyncOperationError) {
    const key: SyncMessageKey =
      error.code === "RESOURCE_SYNC_CONFIG_MISSING"
        ? "error.config"
        : error.code === "RESOURCE_SYNC_STOP_FAILED"
          ? "error.stop"
          : "error.resource";
    const message = syncTranslator.t(key);
    return error.params
      ? syncTranslator.t("error.withReason", { message, reason: error.params.reason })
      : message;
  }
  return error instanceof Error ? error.message : String(error);
}
