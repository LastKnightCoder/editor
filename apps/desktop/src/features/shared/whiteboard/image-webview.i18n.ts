import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/image-webview.zh-CN.json";
import zhTW from "./locales/image-webview.zh-TW.json";
import enUS from "./locales/image-webview.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const imageWebviewTranslator = desktopI18n.get(messages);
export function useImageWebviewI18n() {
  return useI18n(messages, desktopI18n);
}
export type ImageModalIssue =
  | { kind: "prompt-required" }
  | { kind: "insert" | "generate"; cause: unknown };
export function imageModalIssueText(issue: ImageModalIssue): string {
  if (issue.kind === "prompt-required") return imageWebviewTranslator.t("error.promptRequired");
  const cause = issue.cause;
  if (cause && typeof cause === "object" && "code" in cause) {
    switch (cause.code) {
      case "WHITEBOARD_IMAGE_URL_REQUIRED":
        return imageWebviewTranslator.t("error.urlRequired");
      case "WHITEBOARD_IMAGE_URL_PROTOCOL":
        return imageWebviewTranslator.t("error.urlProtocol");
      case "WHITEBOARD_IMAGE_RESULT_EMPTY":
        return imageWebviewTranslator.t("error.imageEmpty");
      case "WHITEBOARD_IMAGE_TARGET_CHANGED":
        return imageWebviewTranslator.t("error.imageTarget");
    }
  }
  if (cause instanceof Error && cause.message) return cause.message;
  if (typeof cause === "string" && cause) return cause;
  return imageWebviewTranslator.t(
    issue.kind === "insert" ? "error.imageInsert" : "error.imageGenerate"
  );
}
