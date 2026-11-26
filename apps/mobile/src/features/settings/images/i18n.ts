import { ImageAccountFieldsError } from "./errors";
import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n as runtime } from "../../../services/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

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

export function imageSettingsErrorText(error: unknown): string {
  return error instanceof ImageAccountFieldsError
    ? imageText("validation.fieldsRequired")
    : error instanceof Error
      ? error.message
      : imageText("error.saveFailed");
}
