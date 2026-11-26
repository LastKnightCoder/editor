import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { ttsWorkspaceMessages } from "./tts-workspace.messages";
export function useTtsWorkspaceI18n() {
  return useI18n(ttsWorkspaceMessages, desktopI18n);
}
