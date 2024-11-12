import { create } from 'zustand';
import { ChatMessage } from "@/types";
import { createChatMessage, deleteChatMessage, updateChatMessage, getAllChatMessages } from '@/commands';
import { produce } from "immer";

interface IState {
  chats: ChatMessage[];
}

interface IAction {
  initChatMessage: () => Promise<void>;
  createChatMessage: (messages: ChatMessage['messages'], title?: string) => Promise<ChatMessage>;
  updateChatMessage: (chatMessage: Omit<ChatMessage, 'updateTime'>) => Promise<ChatMessage>;
  deleteChatMessage: (id: number) => Promise<number>;
}

const useChatMessageStore = create<IState & IAction>()((set, get) => ({
  chats: [] as ChatMessage[],
  initChatMessage: async () => {
    const chats = await getAllChatMessages();
    set({ chats });
  },
  createChatMessage: async (messages, title) => {
    const { chats } = get();
    const createdChatMessage = await createChatMessage(messages, title);
    const newChats = produce(chats, draft => {
      draft.push(createdChatMessage);
    });
    set({ chats: newChats });

    return createdChatMessage;
  },
  updateChatMessage: async (chatMessage) => {
    const { chats } = get();
    const updatedChatMessage = await updateChatMessage(chatMessage);
    const newChats = produce(chats, draft => {
      const index = draft.findIndex(chat => chat.id === updatedChatMessage.id);
      if (index !== -1) {
        draft[index] = updatedChatMessage;
      }
    })
    set({ chats: newChats });

    return updatedChatMessage;
  },
  deleteChatMessage: async (id) => {
    const { chats } = get();
    const res =await deleteChatMessage(id);
    const newChats = produce(chats, draft => {
      const index = draft.findIndex(chat => chat.id === id);
      if (index !== -1) {
        draft.splice(index, 1);
      }
    })
    set({ chats: newChats });

    return res;
  },
}));

export default useChatMessageStore;
