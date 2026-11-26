import { defineI18n, type Translator } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/activity.zh-CN.json";
import zhTW from "./locales/activity.zh-TW.json";
import enUS from "./locales/activity.en-US.json";
export const toolActivityMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const toolActivityTranslator = desktopI18n.get(toolActivityMessages);
export type ActivityTranslate = Translator<Parameters<typeof toolActivityMessages.ref>[0]>["t"];
export function useToolActivityI18n() {
  return useI18n(toolActivityMessages, desktopI18n);
}
export function subagentStatusLabel(status: string, t: ActivityTranslate): string {
  switch (status) {
    case "pending":
    case "running":
    case "success":
    case "partial_success":
    case "failed":
    case "cancelled":
      return t(`activity.status.${status}`);
    default:
      return status;
  }
}
