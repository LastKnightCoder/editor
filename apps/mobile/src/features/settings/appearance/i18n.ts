import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../../services/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const appearanceTranslator = mobileI18n.get(messages);
export function useAppearanceI18n() {
  return useI18n(messages, mobileI18n);
}
const THEME_KEYS = {
  paper: "theme.paper",
  matcha: "theme.matcha",
  mint: "theme.mint",
  celadon: "theme.celadon",
  ocean: "theme.ocean",
  wisteria: "theme.wisteria",
  sakura: "theme.sakura",
  ink: "theme.ink",
  mono: "theme.mono",
} as const;
export function themeDisplayName(key: string, fallback: string): string {
  if (!Object.hasOwn(THEME_KEYS, key)) return fallback;
  return appearanceTranslator.t(THEME_KEYS[key as keyof typeof THEME_KEYS]);
}
