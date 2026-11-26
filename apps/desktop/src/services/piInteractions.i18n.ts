import { defineI18n } from "@tau/i18n";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/pi-interactions.zh-CN.json";
import zhTW from "./locales/pi-interactions.zh-TW.json";
import enUS from "./locales/pi-interactions.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const piInteractionText = desktopI18n.get(messages).t;
export const piInteractionRiskText = (risk: string) =>
  risk === "read" || risk === "write" || risk === "execute"
    ? piInteractionText(`risk.${risk}`)
    : risk;
