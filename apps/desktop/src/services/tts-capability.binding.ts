import { desktopI18n } from "@/app/i18n/runtime";
import { ttsCapabilityMessages } from "./tts-capability.messages";
import type { TtsCapabilityFailure } from "./tts-capability-error";
const translator = desktopI18n.get(ttsCapabilityMessages);
export const ttsCapabilityFailureText = (error: TtsCapabilityFailure) => translator.t(error.code);
