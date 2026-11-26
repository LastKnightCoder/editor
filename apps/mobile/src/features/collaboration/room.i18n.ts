import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import { mapErrorToMessage, parseInvokeError } from "../../services/errors";
import type { CollaborationDocumentIssue } from "./hooks/useCollaborationDocument";
import zhCN from "./locales/room.zh-CN.json";
import zhTW from "./locales/room.zh-TW.json";
import enUS from "./locales/room.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type RoomMessageKey = Parameters<typeof messages.ref>[0];
export type RoomLocale = {
  locale: string;
  t(key: RoomMessageKey, values?: TranslationValues): string;
};
export const roomTranslator = mobileI18n.get(messages);
export function useRoomI18n() {
  return useI18n(messages, mobileI18n);
}
function failureCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : parseInvokeError(error).code;
}
export function roomFailureText(
  error: unknown,
  fallback: RoomMessageKey = "error.operation"
): string {
  const code = failureCode(error);
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return mapErrorToMessage(code, message || roomTranslator.t(fallback));
}

export function documentIssueText(issue: CollaborationDocumentIssue, { t }: RoomLocale): string {
  const code = issue.kind === "coded" ? issue.code : failureCode(issue.cause);
  return code === "CONTENT_FORMAT_UNSUPPORTED"
    ? t("document.unsupported")
    : roomFailureText(issue.cause, "document.loadFailed");
}
