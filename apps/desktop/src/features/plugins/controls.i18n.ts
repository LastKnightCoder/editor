import type { NotebookPlan } from "@/types/vibe-learning";
import type { SettingsDraftFeedback } from "@tau/plugins/settings-draft";
import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/controls.zh-CN.json";
import zhTW from "./locales/controls.zh-TW.json";
import enUS from "./locales/controls.en-US.json";
export const pluginControlsMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const pluginControlsTranslator = desktopI18n.get(pluginControlsMessages);
export type PluginControlsKey = Parameters<typeof pluginControlsMessages.ref>[0];
export function usePluginControlsI18n() {
  return useI18n(pluginControlsMessages, desktopI18n);
}
export function pluginControlsNumber(value: number) {
  return value.toLocaleString(desktopI18n.getSnapshot());
}
export function pluginControlsCount(
  key: PluginControlsKey,
  count: number,
  values: TranslationValues = {}
) {
  return pluginControlsTranslator.t(key, { ...values, count, amount: pluginControlsNumber(count) });
}

export function pluginControlsFeedback(
  key: PluginControlsKey,
  values?: TranslationValues
): SettingsDraftFeedback {
  return {
    get message() {
      return pluginControlsTranslator.t(key, values);
    },
  };
}
export class PluginControlsError extends Error {
  constructor(
    readonly messageKey: PluginControlsKey,
    diagnostic: string,
    readonly values?: TranslationValues,
    options?: ErrorOptions
  ) {
    super(diagnostic, options);
  }
}
export function pluginControlsFailure(failure: unknown, diagnostic?: string): string {
  if (failure instanceof PluginControlsError)
    return pluginControlsTranslator.t(failure.messageKey, failure.values);
  if (failure instanceof Error)
    return failure.message || diagnostic || pluginControlsTranslator.t("common.saveFailed");
  return (
    diagnostic ||
    (failure != null ? String(failure) : pluginControlsTranslator.t("common.saveFailed"))
  );
}

export function pluginControlsNotebookImpact(plan: NotebookPlan): string {
  const count = plan.notes.length + (plan.excerpts.length ? 1 : 0) + plan.clips.length;
  return [
    count
      ? pluginControlsCount("notebook.resources", count)
      : pluginControlsTranslator.t("notebook.noResources"),
    plan.skipped ? pluginControlsCount("notebook.skipped", plan.skipped) : "",
  ]
    .filter(Boolean)
    .join("；");
}
