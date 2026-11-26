import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { extensionI18n } from "../shared/i18n";
import zhCN from "./locales/actions.zh-CN.json";
import zhTW from "./locales/actions.zh-TW.json";
import enUS from "./locales/actions.en-US.json";

const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const actionsTranslator = extensionI18n.get(messages);
export function useActionsI18n() {
  return useI18n(messages, extensionI18n);
}

export function annotationRelativeTime(
  time: number,
  { locale, t }: Pick<ReturnType<typeof useActionsI18n>, "locale" | "t">
): string {
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return t("time.now");
  const value =
    minutes < 60 ? minutes : minutes < 1440 ? Math.round(minutes / 60) : Math.round(minutes / 1440);
  const unit = minutes < 60 ? "minute" : minutes < 1440 ? "hour" : "day";
  return new Intl.RelativeTimeFormat(locale).format(-value, unit);
}
