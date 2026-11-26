import { mobileI18n } from "../../services/i18n";
import { toolMessages } from "./tools.messages";
export const toolsTranslator = mobileI18n.get(toolMessages);
export const toolT = toolsTranslator.t;
