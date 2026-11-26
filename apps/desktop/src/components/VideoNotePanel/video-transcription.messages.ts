import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/video-transcription.zh-CN.json";
import zhTW from "./locales/video-transcription.zh-TW.json";
import enUS from "./locales/video-transcription.en-US.json";
export const videoTranscriptionMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
