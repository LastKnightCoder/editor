import { defineI18n, type Translator, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/workbench.zh-CN.json";
import zhTW from "./locales/workbench.zh-TW.json";
import enUS from "./locales/workbench.en-US.json";
export const skillWorkbenchMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const skillWorkbenchTranslator = desktopI18n.get(skillWorkbenchMessages);
export type WorkbenchTranslate = Translator<Parameters<typeof skillWorkbenchMessages.ref>[0]>["t"];
export function useSkillWorkbenchI18n() {
  return useI18n(skillWorkbenchMessages, desktopI18n);
}
export function workbenchFeedback(
  key: Parameters<WorkbenchTranslate>[0],
  values?: TranslationValues
) {
  const parameters = values && Object.freeze({ ...values });
  const getMessage = () => skillWorkbenchTranslator.t(key, parameters);
  return [getMessage(), { getMessage }] as const;
}
export type SkillTemplateKey = "blank" | "workflow" | "reference" | "format";
export function skillTemplateLabel(key: SkillTemplateKey, t: WorkbenchTranslate) {
  return t(`workbench.template.${key}`);
}
export function skillTemplateHint(key: SkillTemplateKey, t: WorkbenchTranslate) {
  return t(`workbench.template.${key}Hint`);
}
