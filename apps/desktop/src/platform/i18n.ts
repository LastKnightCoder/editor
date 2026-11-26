import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { platform } from "./index";
import zhCN from "./locales/ui.zh-CN.json";
import zhTW from "./locales/ui.zh-TW.json";
import enUS from "./locales/ui.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
const translator = desktopI18n.get(messages);
export function getPlatformLabels() {
  const os = platform.os === "darwin" ? "mac" : platform.os === "win32" ? "win" : "other";
  return {
    revealInFileManagerLabel: translator.t(`reveal.${os}`),
    trashName: translator.t(`trash.${os}`),
  };
}
export function usePlatformLabels() {
  useI18n(messages, desktopI18n);
  return getPlatformLabels();
}
