import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import zhCN from "./locales/skills.zh-CN.json";
import zhTW from "./locales/skills.zh-TW.json";
import enUS from "./locales/skills.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const skillsTranslator = mobileI18n.get(messages);
export function useSkillsI18n() {
  return useI18n(messages, mobileI18n);
}
