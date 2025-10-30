import { create } from "zustand";
import { ChatMessage, ChatGroup } from "@/types";
import {
  createChatMessage,
  deleteChatMessage,
  updateChatMessage,
  getAllChatMessages,
  createChatGroup,
  updateChatGroup,
  deleteChatGroup,
  getAllChatGroups,
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
  groups: ChatGroup[];
}

interface IAction {
  initChatMessage: () => Promise<void>;
  initChatGroups: () => Promise<void>;
  createChatMessage: (
    messages: ChatMessage["messages"],
    title?: string,
    groupId?: number | null,
  ) => Promise<ChatMessage>;
  // 以下二者的区别在于，一个存数据库了，一个没存
  updateCurrentChat: (chatMessage: ChatMessage) => void;
  updateChatMessage: (
    chatMessage: Omit<ChatMessage, "updateTime">,
  ) => Promise<ChatMessage>;
  deleteChatMessage: (id: number) => Promise<number>;
  archiveChatMessage: (id: number, archived: boolean) => Promise<ChatMessage>;
  moveChatToGroup: (
    chatId: number,
    groupId: number | null,
  ) => Promise<ChatMessage>;
  createChatGroup: (
    name: string,
    parentId?: number | null,
  ) => Promise<ChatGroup>;
  updateChatGroup: (id: number, name: string) => Promise<ChatGroup>;
  deleteChatGroup: (id: number) => Promise<number>;
}

const useChatMessageStore = create<IState & IAction>()(
  persist(
    (set, get) => ({
      open: false,
      width: 400,
      currentChatId: null,
      chats: [] as ChatMessage[],
      groups: [] as ChatGroup[],
      status: EStatus.UN_INIT,
      initChatMessage: async () => {
        set({ status: EStatus.LOADING });
        const chats = await getAllChatMessages();
        set({ chats, status: EStatus.SUCCESS });
      },
      initChatGroups: async () => {
        const groups = await getAllChatGroups();
        set({ groups });
      },
      createChatMessage: async (messages, title, groupId) => {
        const { chats } = get();
        const createdChatMessage = await createChatMessage(
          messages,
          title,
          groupId,
        );
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
      archiveChatMessage: async (id, archived) => {
        const { chats } = get();
        const chat = chats.find((c) => c.id === id);
        if (!chat) throw new Error("Chat not found");

        const updatedChat = { ...chat, archived };
        const result = await updateChatMessage(updatedChat);

        const newChats = produce(chats, (draft) => {
          const index = draft.findIndex((c) => c.id === id);
          if (index !== -1) {
            draft[index] = result;
          }
        });
        set({ chats: newChats });
        return result;
      },
      moveChatToGroup: async (chatId, groupId) => {
        const { chats } = get();
        const chat = chats.find((c) => c.id === chatId);
        if (!chat) throw new Error("Chat not found");

        const updatedChat = { ...chat, groupId };
        const result = await updateChatMessage(updatedChat);

        const newChats = produce(chats, (draft) => {
          const index = draft.findIndex((c) => c.id === chatId);
          if (index !== -1) {
            draft[index] = result;
          }
        });
        set({ chats: newChats });
        return result;
      },
      createChatGroup: async (name, parentId) => {
        const { groups } = get();
        const createdGroup = await createChatGroup({ name, parentId });
        const newGroups = produce(groups, (draft) => {
          draft.push(createdGroup);
        });
        set({ groups: newGroups });
        return createdGroup;
      },
      updateChatGroup: async (id, name) => {
        const { groups } = get();
        const updatedGroup = await updateChatGroup({ id, name });
        const newGroups = produce(groups, (draft) => {
          const index = draft.findIndex((g) => g.id === id);
          if (index !== -1) {
            draft[index] = updatedGroup;
          }
        });
        set({ groups: newGroups });
        return updatedGroup;
      },
      deleteChatGroup: async (id) => {
        const { groups } = get();
        const res = await deleteChatGroup(id);
        const newGroups = produce(groups, (draft) => {
          const index = draft.findIndex((g) => g.id === id);
          if (index !== -1) {
            draft.splice(index, 1);
          }
        });
        set({ groups: newGroups });
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
