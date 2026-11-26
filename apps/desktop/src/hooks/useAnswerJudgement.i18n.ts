import { defineI18n } from "@tau/i18n";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/answer-judgement.zh-CN.json";
import zhTW from "./locales/answer-judgement.zh-TW.json";
import enUS from "./locales/answer-judgement.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export function answerJudgementErrorText(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const t = desktopI18n.get(messages).t;
    if (error.code === "ANSWER_JUDGEMENT_MODEL_MISSING") return t("model");
    if (error.code === "ANSWER_JUDGEMENT_FAILED") return t("failed");
    if (error.code === "ANSWER_JUDGEMENT_EMPTY") return t("empty");
  }
  return error instanceof Error ? error.message : String(error ?? "");
}
