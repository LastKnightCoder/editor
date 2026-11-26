import { defineI18n } from "@tau/i18n";
import { mobileI18n } from "./i18n";
import { mapErrorToMessage } from "./errors";
import { classifyUploadError, type UploadFailure } from "./uploadOutcome";
import zhCN from "./locales/upload-outcome.zh-CN.json";
import zhTW from "./locales/upload-outcome.zh-TW.json";
import enUS from "./locales/upload-outcome.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
const translator = mobileI18n.get(messages);
export function uploadFailureText(value: unknown): string {
  const failure: UploadFailure =
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "message" in value &&
    typeof value.message === "string"
      ? (value as UploadFailure)
      : classifyUploadError(value);
  const t = translator.t;
  switch (failure.kind) {
    case "config":
      return failure.message ? t("config.detail", { reason: failure.message }) : t("config");
    case "auth":
    case "location":
    case "network":
    case "local":
      return t(failure.kind);
    default:
      return failure.code
        ? mapErrorToMessage(failure.code, failure.message || t("failed"))
        : failure.message || t("failed");
  }
}
