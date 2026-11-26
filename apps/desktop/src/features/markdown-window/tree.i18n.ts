import { defineI18n, type Translator, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import type { FileNameIssue } from "./paths";
import zhCN from "./locales/tree.zh-CN.json";
import zhTW from "./locales/tree.zh-TW.json";
import enUS from "./locales/tree.en-US.json";
export const markdownTreeMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const markdownTreeTranslator = desktopI18n.get(markdownTreeMessages);
export type MarkdownTreeTranslate = Translator<Parameters<typeof markdownTreeMessages.ref>[0]>["t"];
export type NameFailure =
  | { kind: "name"; issue: FileNameIssue }
  | { kind: "exists" }
  | { kind: "operation"; cause: unknown };
export function useMarkdownTreeI18n() {
  return useI18n(markdownTreeMessages, desktopI18n);
}
export const treeErrorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
export function nameFailureText(failure: NameFailure, t: MarkdownTreeTranslate): string {
  return failure.kind === "name"
    ? t(`tree.name.${failure.issue}`)
    : failure.kind === "exists"
      ? t("tree.exists")
      : treeErrorText(failure.cause);
}
export function markdownTreeFeedback(
  key: Parameters<MarkdownTreeTranslate>[0],
  values?: TranslationValues
) {
  const parameters = values && Object.freeze({ ...values });
  const getMessage = () => markdownTreeTranslator.t(key, parameters);
  return [getMessage(), { getMessage }] as const;
}
