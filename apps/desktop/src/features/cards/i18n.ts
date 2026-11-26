import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const cardsMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type CardsMessageKey = Parameters<typeof cardsMessages.ref>[0];
export const cardsTranslator = desktopI18n.get(cardsMessages);
export function useCardsI18n() {
  return useI18n(cardsMessages, desktopI18n);
}
