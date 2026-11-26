import { mobileI18n as runtime } from "../../../services/i18n";
import { ttsSettingsMessages, type TtsMessageKey } from "./messages";
import type { TranslationValues } from "@tau/i18n";
import type { JsonValue } from "@tau/plugins";
import { TtsSettingsError } from "./tts-settings-error";
import { ttsErrorMessage } from "./errors";

export const ttsSettingsTranslator = runtime.get(ttsSettingsMessages);
export const ttsText = ttsSettingsTranslator.t;
export type { TtsMessageKey } from "./messages";
export type TtsIssue = { key: TtsMessageKey; values?: TranslationValues } | { message: string };
export function ttsIssue(
  error: unknown,
  config?: JsonValue,
  fallback: TtsMessageKey = "error.operationFailed"
): TtsIssue {
  if (error instanceof TtsSettingsError) return { key: `error.${error.code}` };
  const message = ttsErrorMessage(error, config, "");
  return message.trim() ? { message } : { key: fallback };
}
export const ttsIssueText = (issue: TtsIssue | null): string =>
  !issue ? "" : "message" in issue ? issue.message : ttsText(issue.key, issue.values);
export const ttsErrorText = (error: unknown, config?: JsonValue, fallback?: TtsMessageKey) =>
  ttsIssueText(ttsIssue(error, config, fallback));
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
