import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import { conversationMessages } from "./conversation.messages";
export function useConversationI18n() {
  return useI18n(conversationMessages, mobileI18n);
}
