import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import { speechWorkspaceMessages } from "./workspace.messages";
export function useSpeechWorkspaceI18n() {
  return useI18n(speechWorkspaceMessages, mobileI18n);
}
