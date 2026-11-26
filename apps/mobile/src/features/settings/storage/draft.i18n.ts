import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../../services/i18n";
import zhCN from "./locales/draft.zh-CN.json";
import zhTW from "./locales/draft.zh-TW.json";
import enUS from "./locales/draft.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export function useProviderDraftI18n() {
  return useI18n(messages, mobileI18n);
}
