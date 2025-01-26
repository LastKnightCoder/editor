import { invoke } from '@/electron';
import { Message, ChatMessage } from '@/types';

export const createChatMessage = (messages: Message[], title = '新对话'): Promise<ChatMessage> => {
  return invoke('create-chat-message', { messages, title });
};

export const getChatMessageById = (id: number): Promise<ChatMessage> => {
  return invoke('get-chat-message-by-id', { id });
};

export const updateChatMessage = (chatMessage: Omit<ChatMessage, 'updateTime'>): Promise<ChatMessage> => {
  return invoke('update-chat-message', chatMessage);
};

export const deleteChatMessage = (id: number): Promise<number> => {
  return invoke('delete-chat-message', id);
};

export const getAllChatMessages = (): Promise<ChatMessage[]> => {
  return invoke('get-all-chat-messages');
};
