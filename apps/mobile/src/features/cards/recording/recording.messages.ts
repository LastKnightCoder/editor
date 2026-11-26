import { defineI18n, type TranslationValues } from "@tau/i18n";
import zhCN from "./locales/recording.zh-CN.json";
import zhTW from "./locales/recording.zh-TW.json";
import enUS from "./locales/recording.en-US.json";
export const recordingMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type RecordingMessageKey = Parameters<typeof recordingMessages.ref>[0];
export interface RecordingDisplayContext {
  locale: string;
  t(key: RecordingMessageKey, values?: TranslationValues): string;
}
