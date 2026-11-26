import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n as runtime } from "@/app/i18n/runtime";
import zhCN from "./locales/image-generation.zh-CN.json";
import zhTW from "./locales/image-generation.zh-TW.json";
import enUS from "./locales/image-generation.en-US.json";

export const imageSettingsMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type ImageSettingsMessageKey = Parameters<typeof imageSettingsMessages.ref>[0];
export const imageSettingsTranslator = runtime.get(imageSettingsMessages);
export const imageText = imageSettingsTranslator.t;
export function useImageSettingsI18n() {
  return useI18n(imageSettingsMessages, runtime);
}
