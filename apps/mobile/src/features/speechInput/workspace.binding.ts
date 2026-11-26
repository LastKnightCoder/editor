import { mobileI18n } from "../../services/i18n";
import { SpeechInputFailure, type SpeechInputFailureCode } from "../../services/speechInputState";
import { speechWorkspaceMessages, type SpeechWorkspaceMessageKey } from "./workspace.messages";
export const speechWorkspaceTranslator = mobileI18n.get(speechWorkspaceMessages);
export const speechWorkspaceT = speechWorkspaceTranslator.t;
const ERROR_KEYS: Record<SpeechInputFailureCode, SpeechWorkspaceMessageKey> = {
  SPEECH_PLUGIN_NOT_CONFIGURED: "error.pluginUnconfigured",
  SPEECH_ACCOUNT_NOT_CONFIGURED: "error.accountUnconfigured",
  SPEECH_PLUGIN_NOT_READY: "error.pluginNotReady",
  SPEECH_INPUT_BUSY: "error.busy",
  SPEECH_INPUT_UNAVAILABLE: "error.unavailable",
  SPEECH_INPUT_FAILED: "error.failed",
};
export function speechFailureText(error: unknown) {
  return error instanceof SpeechInputFailure
    ? speechWorkspaceT(ERROR_KEYS[error.code])
    : error instanceof Error
      ? error.message
      : speechWorkspaceT("error.failed");
}
