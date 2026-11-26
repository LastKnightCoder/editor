import { desktopI18n } from "@/app/i18n/runtime";
import { ttsWorkspaceMessages } from "./tts-workspace.messages";
import { TtsWorkspaceFailure } from "./tts-workspace-error";
export const ttsWorkspaceT = desktopI18n.get(ttsWorkspaceMessages).t;
export function ttsWorkspaceFailureText(error: unknown): string {
  return error instanceof TtsWorkspaceFailure
    ? ttsWorkspaceT(`failure.${error.code}`)
    : error instanceof Error
      ? error.message
      : String(error);
}
