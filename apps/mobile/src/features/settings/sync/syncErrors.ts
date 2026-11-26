import { StorageNotReadyError } from "../storage/errors";
import { storageErrorText } from "../storage/i18n";
import type { TranslationValues } from "@tau/i18n";
import { syncTranslator, type SyncMessageKey } from "./i18n";
import { mapErrorToMessage, parseInvokeError } from "../../../services/errors";

/** 把 invoke 错误（CODE:详情）翻译成用户可读文案，详情与基础文案不同时附在括号里 */
export function resolveSyncErrorMessage(error: unknown, fallback: string): string {
  const parsed = parseInvokeError(error);
  const baseMessage = mapErrorToMessage(parsed.code, parsed.message || fallback);
  const detailMessage = parsed.message && parsed.message !== parsed.code ? parsed.message : "";
  if (detailMessage && detailMessage !== baseMessage) {
    return syncTranslator.t("error.detail", { message: baseMessage, detail: detailMessage });
  }
  return baseMessage;
}

export interface SyncFailure {
  cause: unknown;
  fallback: SyncMessageKey;
  values?: TranslationValues;
}
export function syncFailureText(failure: SyncFailure): string {
  return resolveSyncErrorMessage(failure.cause, syncTranslator.t(failure.fallback, failure.values));
}
export function syncProviderErrorText(error: unknown): string {
  return error instanceof StorageNotReadyError
    ? storageErrorText(error)
    : syncFailureText({ cause: error, fallback: "error.checkConfig" });
}

export function resourceProgressErrorText(
  progress: { errorCode?: string | null; errorMessage?: string | null },
  fallback: string
): string | null {
  if (progress.errorCode)
    return resolveSyncErrorMessage(
      `${progress.errorCode}:${progress.errorMessage ?? ""}`,
      fallback
    );
  return progress.errorMessage || null;
}
