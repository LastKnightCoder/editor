import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n as runtime } from "../../services/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
export const pomodoroMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type PomodoroMessageKey = Parameters<typeof pomodoroMessages.ref>[0];
export const pomodoroTranslator = runtime.get(pomodoroMessages);
export const pomoText = pomodoroTranslator.t;
const numberFormats = new Map<string, Intl.NumberFormat>();
export function pomoValue(value: unknown): string {
  if (typeof value !== "number") return String(value);
  const locale = runtime.getSnapshot();
  let format = numberFormats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 });
    numberFormats.set(locale, format);
  }
  return format.format(value);
}
export function usePomodoroI18n() {
  return useI18n(pomodoroMessages, runtime);
}
export const getPomodoroLocale = runtime.getSnapshot;

export function presetNameOf(
  presets: import("../../types").PomodoroPreset[],
  session: import("../../types").PomodoroSession
): string {
  return (
    presets.find(preset => preset.id === session.presetId)?.name ??
    pomoText("fallback.deletedPreset")
  );
}
