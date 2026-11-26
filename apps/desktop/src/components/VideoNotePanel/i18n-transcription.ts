import { TranscriptionSettingsError } from "./transcription-settings-error";
import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n as runtime } from "@/app/i18n/runtime";
import zhCN from "./locales/transcription.zh-CN.json";
import zhTW from "./locales/transcription.zh-TW.json";
import enUS from "./locales/transcription.en-US.json";

export const transcriptionSettingsMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type TranscriptionSettingsMessageKey = Parameters<
  typeof transcriptionSettingsMessages.ref
>[0];
export const transcriptionSettingsTranslator = runtime.get(transcriptionSettingsMessages);
export const transcriptionText = transcriptionSettingsTranslator.t;
export function useTranscriptionI18n() {
  return useI18n(transcriptionSettingsMessages, runtime);
}
const formats = new Map<string, Intl.NumberFormat>();
export function transcriptionValue(value: unknown): string {
  if (typeof value !== "number") return String(value);
  const locale = runtime.getSnapshot();
  let format = formats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 });
    formats.set(locale, format);
  }
  return format.format(value);
}

const languageCodes = [
  "auto",
  "zh",
  "en",
  "ja",
  "ko",
  "fr",
  "de",
  "es",
  "ru",
  "it",
  "pt",
  "ar",
  "hi",
] as const;
export function transcriptionLanguageText(value: string, fallback: string): string {
  const code = languageCodes.find(code => code === value);
  return code ? transcriptionText(`language.${code}`) : fallback;
}
export function transcriptionErrorText(error: unknown): string {
  return error instanceof TranscriptionSettingsError
    ? transcriptionText("error.downloadFailed")
    : error instanceof Error
      ? error.message
      : String(error);
}
