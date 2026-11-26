import { defineI18n } from "@tau/i18n";
import { mobileI18n } from "./i18n";
import zhCN from "./locales/errors.zh-CN.json";
import zhTW from "./locales/errors.zh-TW.json";
import enUS from "./locales/errors.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
type ErrorKey = Parameters<typeof messages.ref>[0];
export function localizedErrorMessage(code: string): string | undefined {
  return Object.hasOwn(messages.resources[messages.fallbackLocale], code)
    ? mobileI18n.get(messages).t(code as ErrorKey)
    : undefined;
}
