import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../../services/i18n";
import type { FeedbackIssue } from "./errors";
import { formatFeedbackSize } from "./format";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
export const feedbackMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type FeedbackMessageKey = Parameters<typeof feedbackMessages.ref>[0];
export const feedbackTranslator = mobileI18n.get(feedbackMessages);
export function useFeedbackI18n() {
  return useI18n(feedbackMessages, mobileI18n);
}
export function feedbackDisplayContext() {
  return { locale: mobileI18n.getSnapshot(), t: feedbackTranslator.t };
}
export function feedbackText(key: FeedbackMessageKey, values: TranslationValues = {}) {
  const params: Record<string, string | number | boolean> = { ...values };
  for (const [name, value] of Object.entries(values))
    if (typeof value === "number" && name !== "count")
      params[name] = value.toLocaleString(mobileI18n.getSnapshot());
  if (typeof values.count === "number")
    params.amount = values.count.toLocaleString(mobileI18n.getSnapshot());
  if (typeof values.limitBytes === "number")
    params.limit = formatFeedbackSize(values.limitBytes, mobileI18n.getSnapshot());
  return feedbackTranslator.t(key, params);
}
const CODE_KEYS: Readonly<Record<string, FeedbackMessageKey>> = {
  FEEDBACK_CAPTURE_FAILED: "error.capture",
  FEEDBACK_WINDOW_UNAVAILABLE: "error.windowUnavailable",
  FEEDBACK_NO_CAPTURE_SOURCE: "capture.empty",
  FEEDBACK_MESSAGE_INVALID: "error.messageLength",
  FEEDBACK_TOO_MANY_IMAGES: "error.maxImages",
  FEEDBACK_IMAGE_TOO_LARGE: "error.imageLimit",
  FEEDBACK_IMAGE_CONTEXT: "error.imageContext",
  FEEDBACK_IMAGE_COMPRESS_LIMIT: "error.compressLimit",
  FEEDBACK_NETWORK_UNAVAILABLE: "error.network",
  FEEDBACK_SERVICE_UNAVAILABLE: "error.service",
  FEEDBACK_VISITOR_UNAVAILABLE: "error.visitor",
  FEEDBACK_ADDRESS_INVALID: "error.address",
};
const ISSUE_KEYS: Readonly<Record<string, FeedbackMessageKey>> = {
  "image-id": "error.imageId",
  "image-data": "error.imageData",
  "image-not-started": "error.imageNotStarted",
  "image-order": "error.imageOrder",
  kind: "error.kind",
  "request-id": "error.requestId",
  "image-missing": "error.imageMissing",
  "image-type": "error.imageType",
  "image-count": "error.maxImages",
  "message-length": "error.messageLength",
  "image-size": "error.imageLimit",
  "log-size": "error.logLimit",
};
function projectedCause(cause: unknown, fallback: FeedbackMessageKey): string {
  if (cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string") {
    const params =
      "params" in cause && cause.params && typeof cause.params === "object"
        ? (cause.params as TranslationValues)
        : {};
    const key =
      CODE_KEYS[cause.code] ??
      ((cause.code === "INVALID_INPUT" || cause.code === "UPLOAD_TOO_LARGE") &&
      typeof params.issue === "string"
        ? ISSUE_KEYS[params.issue]
        : undefined);
    if (key) return feedbackText(key, params);
  }
  if (cause instanceof Error) return cause.message || feedbackTranslator.t(fallback);
  if (typeof cause === "string" && cause) return cause;
  return feedbackTranslator.t(fallback);
}
export function feedbackIssueText(issue: FeedbackIssue): string {
  if (issue.kind === "message") return feedbackText(issue.key, issue.values);
  if (issue.kind === "cause") return projectedCause(issue.cause, issue.fallback);
  const response = issue.response;
  const key = response.code ? CODE_KEYS[response.code] : undefined;
  return key
    ? feedbackText(key, response.params)
    : response.message || feedbackTranslator.t("error.send");
}
