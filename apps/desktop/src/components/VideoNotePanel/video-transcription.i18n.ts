import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { videoTranscriptionMessages } from "./video-transcription.messages";
export function useVideoTranscriptionI18n() {
  return useI18n(videoTranscriptionMessages, desktopI18n);
}
