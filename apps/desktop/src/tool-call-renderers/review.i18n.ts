import { defineI18n, type Translator, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/review.zh-CN.json";
import zhTW from "./locales/review.zh-TW.json";
import enUS from "./locales/review.en-US.json";
export const reviewToolMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const reviewToolTranslator = desktopI18n.get(reviewToolMessages);
export type ReviewToolTranslate = Translator<Parameters<typeof reviewToolMessages.ref>[0]>["t"];
export function useReviewToolI18n() {
  return useI18n(reviewToolMessages, desktopI18n);
}
export function reviewFeedback(
  key: Parameters<ReviewToolTranslate>[0],
  values?: TranslationValues
) {
  const parameters = values && Object.freeze({ ...values });
  const getMessage = () => reviewToolTranslator.t(key, parameters);
  return [getMessage(), { getMessage }] as const;
}
export function reviewFailure(key: Parameters<ReviewToolTranslate>[0], rawMessage?: string) {
  const getMessage = () => rawMessage ?? reviewToolTranslator.t(key);
  return [getMessage(), { getMessage }] as const;
}

export function reviewSyntheticLabel(
  display: import("@/utils/review-merged-content").ReviewSyntheticDisplay,
  t: ReviewToolTranslate
): string {
  switch (display.kind) {
    case "collapsed":
      return t("review.synthetic.collapsed");
    case "list-icon":
      return t("review.synthetic.listIcon");
    case "highlight-color":
      return t("review.synthetic.color", {
        before: display.before || t("review.synthetic.default"),
        after: display.after || t("review.synthetic.default"),
      });
    case "callout":
    case "code": {
      const changes = display.changes
        .map(change => {
          if (change.kind === "steps") return t("review.synthetic.steps");
          return t(
            change.kind === "type"
              ? "review.synthetic.type"
              : change.kind === "title"
                ? "review.synthetic.title"
                : "review.synthetic.language",
            {
              before: change.before || t("review.synthetic.empty"),
              after: change.after || t("review.synthetic.empty"),
            }
          );
        })
        .join(t("review.synthetic.separator"));
      return t(display.kind === "callout" ? "review.synthetic.callout" : "review.synthetic.code", {
        changes,
      });
    }
  }
}
