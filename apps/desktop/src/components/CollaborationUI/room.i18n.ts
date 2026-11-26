import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/room.zh-CN.json";
import zhTW from "./locales/room.zh-TW.json";
import enUS from "./locales/room.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type RoomMessageKey = Parameters<typeof messages.ref>[0];
export type RoomLocale = {
  locale: string;
  t(key: RoomMessageKey, values?: TranslationValues): string;
};
export const roomTranslator = desktopI18n.get(messages);
export function useRoomI18n() {
  return useI18n(messages, desktopI18n);
}
export function roomErrorText(
  error: unknown,
  fallback: RoomMessageKey = "error.operation"
): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message || roomTranslator.t(fallback);
}
