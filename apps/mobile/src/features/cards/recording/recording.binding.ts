import { mobileI18n } from "../../../services/i18n";
import { recordingMessages } from "./recording.messages";
export const recordingTranslator = mobileI18n.get(recordingMessages);
export const recordingT = recordingTranslator.t;
export const recordingDisplayContext = () => ({ locale: mobileI18n.getSnapshot(), t: recordingT });
