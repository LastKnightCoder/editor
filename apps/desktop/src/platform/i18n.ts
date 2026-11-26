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
export function usePlatformLabels() {
  const { t } = useI18n(messages, desktopI18n);
  const os = platform.os === "darwin" ? "mac" : platform.os === "win32" ? "win" : "other";
  return { revealInFileManagerLabel: t(`reveal.${os}`), trashName: t(`trash.${os}`) };
}
