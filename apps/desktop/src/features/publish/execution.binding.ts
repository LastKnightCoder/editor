import type { TranslationValues } from "@tau/i18n";
import { desktopI18n } from "@/app/i18n/runtime";
import { executionMessages } from "./execution.messages";
import type { RunState } from "./publishRunStore";
export const executionTranslator = desktopI18n.get(executionMessages);
export function executionFeedback(
  key: Parameters<typeof executionMessages.ref>[0],
  values?: TranslationValues
) {
  const params = values && Object.freeze({ ...values });
  return () => executionTranslator.t(key, params);
}
export function publishRunErrorText(run: Extract<RunState, { kind: "error" }>): string {
  return run.issue === "template-required"
    ? executionTranslator.t("template.required")
    : run.message;
}
