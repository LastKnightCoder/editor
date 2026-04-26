import { create } from "zustand";
import { produce } from "immer";
import type { ChatSessionMessage, PdfChatMessage } from "@/types";
import {
  createPdfChat,
  updatePdfChat,
  deletePdfChat,
  getPdfChatsByPdfId,
  getPdfChildBranchesCount,
} from "@/commands";

export enum EPdfChatStatus {
  UN_INIT,
  LOADING,
  SUCCESS,
  FAIL,
}

interface IState {
  pdfId: number | null;
  currentChatId: number | null;
  chats: PdfChatMessage[];
  status: EPdfChatStatus;
}

interface IAction {
  initChats: (pdfId: number) => Promise<void>;
  reset: () => void;
  createChat: (
    messages: ChatSessionMessage[],
    title?: string,
  ) => Promise<PdfChatMessage>;
  updateChat: (
    chat: Omit<PdfChatMessage, "updateTime">,
  ) => Promise<PdfChatMessage>;
  updateCurrentChat: (chat: PdfChatMessage) => void;
  deleteChat: (id: number) => Promise<void>;
  createChatBranch: (
    parentChatId: number,
    messages: ChatSessionMessage[],
    title?: string,
  ) => Promise<PdfChatMessage>;
  getChildBranchesCount: (parentChatId: number) => Promise<number>;
}

let latestInitSequence = 0;

const usePdfChatStore = create<IState & IAction>()((set, get) => ({
  pdfId: null,
  currentChatId: null,
  chats: [],
  status: EPdfChatStatus.UN_INIT,

  initChats: async (pdfId: number) => {
    const sequence = ++latestInitSequence;
    set({
      status: EPdfChatStatus.LOADING,
      pdfId,
      chats: [],
      currentChatId: null,
    });
    try {
      const chats = await getPdfChatsByPdfId(pdfId);
      if (sequence !== latestInitSequence) {
        return;
      }
      set({
        chats,
        status: EPdfChatStatus.SUCCESS,
        currentChatId: chats.length > 0 ? chats[0].id : null,
      });
    } catch (error) {
      console.error("Failed to init pdf chats:", error);
      if (sequence !== latestInitSequence) {
        return;
      }
      set({
        status: EPdfChatStatus.FAIL,
        chats: [],
        currentChatId: null,
      });
    }
  },

  reset: () => {
    set({
      pdfId: null,
      currentChatId: null,
      chats: [],
      status: EPdfChatStatus.UN_INIT,
    });
  },

  createChat: async (messages, title) => {
    const { pdfId, chats } = get();
    if (!pdfId) {
      throw new Error("PDF ID is not set");
    }

    const createdChat = await createPdfChat({
      pdfId,
      messages,
      title: title || "新对话",
    });
    const newChats = produce(chats, (draft) => {
      draft.unshift(createdChat);
    });
    set({ chats: newChats, currentChatId: createdChat.id });
    return createdChat;
  },

  updateChat: async (chat) => {
    const { chats } = get();
    const updatedChat = await updatePdfChat({
      id: chat.id,
      messages: chat.messages,
      title: chat.title,
      archived: chat.archived,
      parentChatId: chat.parentChatId,
      branchIndex: chat.branchIndex,
    });
    if (!updatedChat) {
      throw new Error("Failed to update chat");
    }

    const newChats = produce(chats, (draft) => {
      const index = draft.findIndex((item) => item.id === updatedChat.id);
      if (index !== -1) {
        draft[index] = updatedChat;
      }
    });
    set({ chats: newChats });
    return updatedChat;
  },

  updateCurrentChat: (chat) => {
    const { chats } = get();
    const newChats = produce(chats, (draft) => {
      const index = draft.findIndex((item) => item.id === chat.id);
      if (index !== -1) {
        draft[index] = chat;
      }
    });
    set({ chats: newChats, currentChatId: chat.id });
  },

  deleteChat: async (id) => {
    const { chats, currentChatId } = get();
    await deletePdfChat(id);

    const allIdsToDelete = new Set<number>([id]);
    const findChildren = (parentId: number) => {
      chats.forEach((chat) => {
        if (chat.parentChatId === parentId) {
          allIdsToDelete.add(chat.id);
          findChildren(chat.id);
        }
      });
    };
    findChildren(id);

    const newChats = produce(chats, (draft) =>
      draft.filter((chat) => !allIdsToDelete.has(chat.id)),
    );

    let newCurrentChatId = currentChatId;
    if (currentChatId && allIdsToDelete.has(currentChatId)) {
      newCurrentChatId = newChats.length > 0 ? newChats[0].id : null;
    }

    set({ chats: newChats, currentChatId: newCurrentChatId });
  },

  createChatBranch: async (parentChatId, messages, title) => {
    const { pdfId, chats } = get();
    if (!pdfId) {
      throw new Error("PDF ID is not set");
    }

    const parentChat = chats.find((chat) => chat.id === parentChatId);
    if (!parentChat) {
      throw new Error("Parent chat not found");
    }

    const fallbackBranchIndex =
      chats
        .filter((chat) => chat.parentChatId === parentChatId)
        .reduce(
          (maxIndex, chat) => Math.max(maxIndex, chat.branchIndex ?? -1),
          -1,
        ) + 1;
    const createdChat = await createPdfChat({
      pdfId,
      messages,
      title: title || `${parentChat.title} - 分支 ${fallbackBranchIndex + 1}`,
      parentChatId,
    });

    const newChats = produce(chats, (draft) => {
      draft.unshift(createdChat);
    });
    set({ chats: newChats, currentChatId: createdChat.id });
    return createdChat;
  },

  getChildBranchesCount: async (parentChatId: number) => {
    return await getPdfChildBranchesCount(parentChatId);
  },
}));

export default usePdfChatStore;
