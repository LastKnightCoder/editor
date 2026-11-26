import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { extensionI18n } from "../shared/i18n";
import type { ChatIssue } from "./state/store";
import zhCN from "./locales/chat.zh-CN.json";
import zhTW from "./locales/chat.zh-TW.json";
import enUS from "./locales/chat.en-US.json";

const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const chatTranslator = extensionI18n.get(messages);
export function useContentChatI18n() {
  return useI18n(messages, extensionI18n);
}
export function chatIssueText(issue: ChatIssue): string {
  switch (issue.kind) {
    case "busy":
      return chatTranslator.t("error.busy");
    case "session-missing":
      return chatTranslator.t("error.sessionMissing");
    case "answer-failed":
      return chatTranslator.t("error.answerFailed");
    case "ask-failed":
      return chatTranslator.t("error.askFailed");
    case "diagnostic":
      return chatActionErrorText(issue.cause);
  }
}
export function chatActionErrorText(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && error.code === "COMPANION_RUN_ENDED")
    return chatTranslator.t("error.runEnded");
  return error instanceof Error ? error.message : String(error);
}

export function relativeDay(
  time: number,
  { locale, t }: Pick<ReturnType<typeof useContentChatI18n>, "locale" | "t">
): string {
  const days = Math.floor((Date.now() - time) / 86_400_000);
  if (days <= 0) return t("time.today");
  if (days === 1) return t("time.yesterday");
  return new Intl.RelativeTimeFormat(locale).format(
    -(days < 30 ? days : Math.floor(days / 30)),
    days < 30 ? "day" : "month"
  );
}
