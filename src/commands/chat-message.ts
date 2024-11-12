import { invoke } from '@tauri-apps/api';
import { Message, ChatMessage } from '@/types';

export const createChatMessage = (messages: Message[], title = '新对话'): Promise<ChatMessage> => {
  return invoke('plugin:chat_message|create_chat_message', { messages, title });
};

export const getChatMessageById = (id: number): Promise<ChatMessage> => {
  return invoke('plugin:chat_message|get_chat_message_by_id', { id });
};

export const updateChatMessage = (chatMessage: Omit<ChatMessage, 'updateTime'>): Promise<ChatMessage> => {
  return invoke('plugin:chat_message|update_chat_message', { ...chatMessage });
};

export const deleteChatMessage = (id: number): Promise<number> => {
  return invoke('plugin:chat_message|delete_chat_message', { id });
};

export const getAllChatMessages = (): Promise<ChatMessage[]> => {
  return invoke('plugin:chat_message|get_chat_messages');
};
