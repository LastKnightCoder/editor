import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import { workspaceMessages } from "./workspace.messages";
export function useWorkspaceI18n() {
  return useI18n(workspaceMessages, mobileI18n);
}
