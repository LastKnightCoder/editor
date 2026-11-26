import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../../services/i18n";
import { recordingMessages } from "./recording.messages";
export function useRecordingI18n() {
  return useI18n(recordingMessages, mobileI18n);
}
