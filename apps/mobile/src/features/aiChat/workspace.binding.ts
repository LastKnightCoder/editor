import { mobileI18n } from "../../services/i18n";
import { workspaceMessages } from "./workspace.messages";
export const workspaceTranslator = mobileI18n.get(workspaceMessages);
export const workspaceT = workspaceTranslator.t;
