import { defineI18n, type TranslationValues, type Translator } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import type { SkillItem, SkillMode } from "./useSkills";
import type { SkillSource } from "@/types";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
export const skillsMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type SkillsTranslate = Translator<Parameters<typeof skillsMessages.ref>[0]>["t"];
export const skillsTranslator = desktopI18n.get(skillsMessages);
export function useSkillsI18n() {
  return useI18n(skillsMessages, desktopI18n);
}
export function skillsFeedback(key: Parameters<SkillsTranslate>[0], values?: TranslationValues) {
  const parameters = values && Object.freeze({ ...values });
  const getMessage = () => skillsTranslator.t(key, parameters);
  return [getMessage(), { getMessage }] as const;
}
export function skillWarning(item: SkillItem, t: SkillsTranslate): string {
  switch (item.warning?.code) {
    case "shadowed":
      return t("skills.warning.shadowed");
    case "description-missing":
      return t("skills.warning.descriptionMissing");
    case "description-long":
      return t("skills.warning.descriptionLong", { tokens: item.warning.tokens });
    default:
      return "";
  }
}
export function skillSourceLabel(source: SkillSource, t: SkillsTranslate): string {
  return t(`skills.source.${source}`);
}
export function skillModeOptions(
  t: SkillsTranslate
): { value: SkillMode; label: string; description: string }[] {
  return [
    { value: "auto", label: t("skills.mode.auto"), description: t("skills.mode.autoHint") },
    { value: "manual", label: t("skills.mode.manual"), description: t("skills.mode.manualHint") },
    { value: "off", label: t("skills.mode.off"), description: t("skills.mode.offHint") },
  ];
}
