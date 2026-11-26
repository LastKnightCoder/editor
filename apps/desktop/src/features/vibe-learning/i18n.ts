import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
import type { VLTask } from "./views/VibeLearningView/tasks/store";

export const notebookMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const notebookTranslator = desktopI18n.get(notebookMessages);
export type NotebookMessageKey = Parameters<typeof notebookMessages.ref>[0];
export function useNotebookI18n() {
  return useI18n(notebookMessages, desktopI18n);
}
export function notebookNumber(value: number): string {
  return value.toLocaleString(desktopI18n.getSnapshot());
}
export function notebookCount(
  key: NotebookMessageKey,
  count: number,
  values: TranslationValues = {}
) {
  return notebookTranslator.t(key, { ...values, count, amount: notebookNumber(count) });
}
export class NotebookUiError extends Error {
  constructor(
    readonly messageKey: NotebookMessageKey,
    diagnostic: string,
    readonly values?: TranslationValues
  ) {
    super(diagnostic);
  }
}
export function notebookError(error: unknown, fallback: NotebookMessageKey): string {
  return error instanceof NotebookUiError
    ? notebookTranslator.t(error.messageKey, error.values)
    : error instanceof Error
      ? error.message
      : notebookTranslator.t(fallback);
}
export function notebookTaskPhase(task: VLTask): string {
  return task.phaseSource === "builtin"
    ? notebookTranslator.t(`phase.${task.phase}` as NotebookMessageKey)
    : task.phase;
}
export function notebookTaskError(task: VLTask): string {
  return task.errorCode
    ? notebookTranslator.t(task.errorCode, task.errorValues)
    : task.error || notebookTranslator.t("task.generateFailed");
}

export function notebookElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000)),
    h = Math.floor(total / 3600),
    m = Math.floor((total % 3600) / 60),
    s = total % 60;
  return notebookTranslator.t(h > 0 ? "time.hours" : m > 0 ? "time.minutes" : "time.seconds", {
    h: notebookNumber(h),
    m: notebookNumber(m),
    s: notebookNumber(s),
  });
}

export function notebookTemplate(
  kind: "ppt" | "report",
  template: { id: string; name: string; description: string }
) {
  const nameKey = `template.${kind}.${template.id}.name`;
  if (!Object.hasOwn(zhCN, nameKey)) return template;
  return {
    name: notebookTranslator.t(nameKey as NotebookMessageKey),
    description: notebookTranslator.t(
      `template.${kind}.${template.id}.description` as NotebookMessageKey
    ),
  };
}
