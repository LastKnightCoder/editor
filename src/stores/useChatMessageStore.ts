import { create } from "zustand";
import { ChatMessage } from "@/types";
import {
  createChatMessage,
  deleteChatMessage,
  updateChatMessage,
  getAllChatMessages,
} from "@/commands";
import { produce } from "immer";
import { persist } from "zustand/middleware";

export enum EStatus {
  UN_INIT,
  LOADING,
  SUCCESS,
  FAIL,
}

interface IState {
  open: boolean;
  width: number;
  currentChatId: number | null;
  status: EStatus;
  chats: ChatMessage[];
}

interface IAction {
  initChatMessage: () => Promise<void>;
  createChatMessage: (
    messages: ChatMessage["messages"],
    title?: string,
  ) => Promise<ChatMessage>;
  // 以下二者的区别在于，一个存数据库了，一个没存
  updateCurrentChat: (chatMessage: ChatMessage) => void;
  updateChatMessage: (
    chatMessage: Omit<ChatMessage, "updateTime">,
  ) => Promise<ChatMessage>;
  deleteChatMessage: (id: number) => Promise<number>;
}

const useChatMessageStore = create<IState & IAction>()(
  persist(
    (set, get) => ({
      open: false,
      width: 400,
      currentChatId: null,
      chats: [] as ChatMessage[],
      status: EStatus.UN_INIT,
      initChatMessage: async () => {
        set({ status: EStatus.LOADING });
        const chats = await getAllChatMessages();
        set({ chats, status: EStatus.SUCCESS });
      },
      createChatMessage: async (messages, title) => {
        const { chats } = get();
        const createdChatMessage = await createChatMessage(messages, title);
        const newChats = produce(chats, (draft) => {
          draft.push(createdChatMessage);
        });
        set({ chats: newChats, currentChatId: createdChatMessage.id });

        return createdChatMessage;
      },
      updateCurrentChat: (chatMessage) => {
        const { chats } = get();
        const newChats = produce(chats, (draft) => {
          const index = draft.findIndex((chat) => chat.id === chatMessage.id);
          if (index !== -1) {
            draft[index] = chatMessage;
          }
        });
        set({ chats: newChats, currentChatId: chatMessage.id });
      },
      updateChatMessage: async (chatMessage) => {
        const { chats } = get();
        const updatedChatMessage = await updateChatMessage(chatMessage);
        const newChats = produce(chats, (draft) => {
          const index = draft.findIndex(
            (chat) => chat.id === updatedChatMessage.id,
          );
          if (index !== -1) {
            draft[index] = updatedChatMessage;
          }
        });
        set({ chats: newChats, currentChatId: updatedChatMessage.id });

        return updatedChatMessage;
      },
      deleteChatMessage: async (id) => {
        const { chats } = get();
        const res = await deleteChatMessage(id);
        const newChats = produce(chats, (draft) => {
          const index = draft.findIndex((chat) => chat.id === id);
          if (index !== -1) {
            draft.splice(index, 1);
          }
        });
        set({ chats: newChats, currentChatId: null });
        return res;
      },
    }),
    {
      name: "chat-message",
      partialize: (state) => ({
        open: state.open,
        width: state.width,
        currentChatId: state.currentChatId,
      }),
    },
  ),
);

export default useChatMessageStore;
