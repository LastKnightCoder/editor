import { mobileI18n } from "../../services/i18n";
import { conversationMessages } from "./conversation.messages";
export const conversationTranslator = mobileI18n.get(conversationMessages);
export const conversationT = conversationTranslator.t;
