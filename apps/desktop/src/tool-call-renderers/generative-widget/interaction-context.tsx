import { createContext, useContext } from "react";

export interface ChatWidgetInteractionContextValue {
  sendPrompt: (text: string) => Promise<void>;
}

export const ChatWidgetInteractionContext =
  createContext<ChatWidgetInteractionContextValue | null>(null);

export const ChatWidgetInteractionProvider =
  ChatWidgetInteractionContext.Provider;

export const useChatWidgetInteraction = () =>
  useContext(ChatWidgetInteractionContext);
