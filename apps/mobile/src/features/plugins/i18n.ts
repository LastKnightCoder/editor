import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
export const pluginMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const pluginTranslator = mobileI18n.get(pluginMessages);
export type PluginMessageKey = Parameters<typeof pluginMessages.ref>[0];
export function usePluginI18n() {
  return useI18n(pluginMessages, mobileI18n);
}
export function pluginNumber(value: number): string {
  return value.toLocaleString(mobileI18n.getSnapshot());
}
export function pluginCount(key: PluginMessageKey, count: number, values: TranslationValues = {}) {
  return pluginTranslator.t(key, { ...values, count, amount: pluginNumber(count) });
}

export class PluginUiError extends Error {
  constructor(
    readonly messageKey: PluginMessageKey | undefined,
    diagnostic: string
  ) {
    super(diagnostic);
  }
}
export function pluginError(error: unknown): string {
  return error instanceof PluginUiError && error.messageKey
    ? pluginTranslator.t(error.messageKey)
    : error instanceof Error
      ? error.message
      : String(error);
}
export function pluginPermission(permission: string): string {
  const key = `permission.${permission}`;
  return Object.hasOwn(zhCN, key) ? pluginTranslator.t(key as PluginMessageKey) : permission;
}
export function pluginActionReason(value: {
  reason: string | null;
  reasonCode?: PluginMessageKey;
}): string | null {
  return value.reasonCode ? pluginTranslator.t(value.reasonCode) : value.reason;
}
