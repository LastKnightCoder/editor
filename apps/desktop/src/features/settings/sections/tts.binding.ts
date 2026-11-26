import { desktopI18n as runtime } from "@/app/i18n/runtime";
import { ttsSettingsMessages, type TtsMessageKey } from "./tts.messages";
import type { TranslationValues } from "@tau/i18n";
import { TtsSettingsError } from "./tts-settings-error";

export const ttsSettingsTranslator = runtime.get(ttsSettingsMessages);
export const ttsText = ttsSettingsTranslator.t;
export type { TtsMessageKey } from "./tts.messages";
export type TtsIssue = { key: TtsMessageKey; values?: TranslationValues } | { message: string };
export function ttsIssue(
  error: unknown,
  fallback: TtsMessageKey = "error.operationFailed"
): TtsIssue {
  if (error instanceof TtsSettingsError) return { key: `error.${error.code}` };
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : String(error ?? "");
  return message.trim() ? { message } : { key: fallback };
}
export const ttsIssueText = (issue: TtsIssue | null): string =>
  !issue ? "" : "message" in issue ? issue.message : ttsText(issue.key, issue.values);
export const ttsErrorText = (error: unknown, fallback?: TtsMessageKey) =>
  ttsIssueText(ttsIssue(error, fallback));
const formats = new Map<string, Intl.NumberFormat>();
export function ttsValue(value: unknown): string {
  if (typeof value !== "number") return String(value);
  const locale = runtime.getSnapshot();
  let format = formats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 });
    formats.set(locale, format);
  }
  return format.format(value);
}
