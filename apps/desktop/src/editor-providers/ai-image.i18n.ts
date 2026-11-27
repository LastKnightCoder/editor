import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/ai-image.zh-CN.json";
import zhTW from "./locales/ai-image.zh-TW.json";
import enUS from "./locales/ai-image.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
/** 面板外（插入来源/媒体操作注册表）读取文案用，语言切换后按读取时语言解析 */
export const aiImageT = desktopI18n.get(messages).t;
export function useAIImageI18n() {
  return useI18n(messages, desktopI18n);
}
