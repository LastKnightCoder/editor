import { defaultSpeechInputSetting, type SpeechInputSetting } from "@tau/asr";

import FAILURE_MESSAGES from "./speechInputDiagnostics.json";

export type SpeechInputFailureCode = keyof typeof FAILURE_MESSAGES;

export class SpeechInputFailure extends Error {
  constructor(
    readonly code: SpeechInputFailureCode,
    message: string = FAILURE_MESSAGES[code]
  ) {
    super(message);
    this.name = "SpeechInputFailure";
  }
}

export function speechInputUnavailability(
  setting: SpeechInputSetting = defaultSpeechInputSetting()
): SpeechInputFailure | null {
  if (setting.active === "native") return null;
  if (!setting.plugin.configurations[setting.plugin.id])
    return new SpeechInputFailure("SPEECH_ACCOUNT_NOT_CONFIGURED");
  return null;
}

export function speechInputNeedsSettings(error: unknown): boolean {
  return (
    error instanceof SpeechInputFailure &&
    (error.code === "SPEECH_PLUGIN_NOT_CONFIGURED" ||
      error.code === "SPEECH_ACCOUNT_NOT_CONFIGURED")
  );
}
