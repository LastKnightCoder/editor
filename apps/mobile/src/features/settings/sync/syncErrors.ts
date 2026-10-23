import { mapErrorToMessage, parseInvokeError } from "../../../services/errors";

/** 把 invoke 错误（CODE:详情）翻译成用户可读文案，详情与基础文案不同时附在括号里 */
export function resolveSyncErrorMessage(error: unknown, fallback: string): string {
  const parsed = parseInvokeError(error);
  const baseMessage = mapErrorToMessage(parsed.code, parsed.message || fallback);
  const detailMessage = parsed.message && parsed.message !== parsed.code ? parsed.message : "";
  if (detailMessage && detailMessage !== baseMessage) {
    return `${baseMessage}（${detailMessage}）`;
  }
  return baseMessage;
}
