import { create } from "zustand";
import { produce } from "immer";
import { chatRunManager } from "@/services/chatRunManager";
import type { ChatAgentType, ChatSessionMessage } from "@/types";
import type {
  CreateVideoNoteChat,
  VideoNoteChatMessage,
} from "@/types/video-note";
import {
  createVideoNoteChat,
  updateVideoNoteChat,
  deleteVideoNoteChat,
  getVideoNoteChatsByVideoNoteId,
  getVideoNoteNextBranchIndex,
  getVideoNoteChildBranchesCount,
} from "@/commands/video-note-chat";

export enum EVideoNoteChatStatus {
  UN_INIT,
  LOADING,
  SUCCESS,
  FAIL,
}

interface IState {
  videoNoteId: number | null;
  currentChatId: number | null;
  chats: VideoNoteChatMessage[];
  status: EVideoNoteChatStatus;
}

interface IAction {
  initChats: (videoNoteId: number) => Promise<void>;
  reset: () => void;
  createChat: (
    messages: ChatSessionMessage[],
    title?: string,
    agentType?: ChatAgentType,
    agentSessionId?: string | null,
  ) => Promise<VideoNoteChatMessage>;
  updateChat: (
    chat: Omit<VideoNoteChatMessage, "updateTime">,
  ) => Promise<VideoNoteChatMessage>;
  updateCurrentChat: (chat: VideoNoteChatMessage) => void;
  deleteChat: (id: number) => Promise<void>;
  createChatBranch: (
    parentChatId: number,
    messages: ChatSessionMessage[],
    title?: string,
    agentType?: ChatAgentType,
  ) => Promise<VideoNoteChatMessage>;
  getChildBranchesCount: (parentChatId: number) => Promise<number>;
}

const useVideoNoteChatStore = create<IState & IAction>()((set, get) => ({
  videoNoteId: null,
  currentChatId: null,
  chats: [],
  status: EVideoNoteChatStatus.UN_INIT,

  initChats: async (videoNoteId: number) => {
    set({ status: EVideoNoteChatStatus.LOADING, videoNoteId });
    try {
      const chats = await getVideoNoteChatsByVideoNoteId(videoNoteId);
      set({
        chats,
        status: EVideoNoteChatStatus.SUCCESS,
        currentChatId: chats.length > 0 ? chats[0].id : null,
      });
    } catch (error) {
      console.error("Failed to init video note chats:", error);
      set({ status: EVideoNoteChatStatus.FAIL });
    }
  },

  reset: () => {
    set({
      videoNoteId: null,
      currentChatId: null,
      chats: [],
      status: EVideoNoteChatStatus.UN_INIT,
    });
  },

  createChat: async (messages, title, agentType, agentSessionId) => {
    const { videoNoteId, chats } = get();
    if (!videoNoteId) {
      throw new Error("Video note ID is not set");
    }

    const params: CreateVideoNoteChat = {
      videoNoteId,
      messages,
      title: title || "新对话",
      agentType: agentType ?? "local",
      agentSessionId: agentSessionId ?? null,
    };
    const createdChat = await createVideoNoteChat(params);
    const newChats = produce(chats, (draft) => {
      draft.unshift(createdChat);
    });
    set({ chats: newChats, currentChatId: createdChat.id });
    return createdChat;
  },

  updateChat: async (chat) => {
    const { chats } = get();
    const updatedChat = await updateVideoNoteChat({
      id: chat.id,
      messages: chat.messages,
      title: chat.title,
      archived: chat.archived,
      parentChatId: chat.parentChatId,
      branchIndex: chat.branchIndex,
      agentType: chat.agentType ?? "local",
      agentSessionId: chat.agentSessionId ?? null,
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
    set({ chats: newChats });
  },

  deleteChat: async (id) => {
    const { chats, currentChatId } = get();
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

    await Promise.all(
      Array.from(allIdsToDelete, (chatId) =>
        chatRunManager.discardSession(`video-note-chat:${chatId}`),
      ),
    );
    await deleteVideoNoteChat(id);

    const newChats = produce(chats, (draft) =>
      draft.filter((chat) => !allIdsToDelete.has(chat.id)),
    );

    let newCurrentChatId = currentChatId;
    if (currentChatId && allIdsToDelete.has(currentChatId)) {
      newCurrentChatId = newChats.length > 0 ? newChats[0].id : null;
    }

    set({ chats: newChats, currentChatId: newCurrentChatId });
  },

  createChatBranch: async (parentChatId, messages, title, agentType) => {
    const { videoNoteId, chats } = get();
    if (!videoNoteId) {
      throw new Error("Video note ID is not set");
    }

    const parentChat = chats.find((chat) => chat.id === parentChatId);
    if (!parentChat) {
      throw new Error("Parent chat not found");
    }

    const branchIndex = await getVideoNoteNextBranchIndex(parentChatId);
    const branchTitle =
      title || `${parentChat.title} - 分支 ${branchIndex + 1}`;
    const createdChat = await createVideoNoteChat({
      videoNoteId,
      messages,
      title: branchTitle,
      parentChatId,
      branchIndex,
      agentType: agentType ?? parentChat.agentType ?? "local",
      agentSessionId: null,
    });

    const newChats = produce(chats, (draft) => {
      draft.unshift(createdChat);
    });
    set({ chats: newChats, currentChatId: createdChat.id });
    return createdChat;
  },

  getChildBranchesCount: async (parentChatId) => {
    return await getVideoNoteChildBranchesCount(parentChatId);
  },
}));

export default useVideoNoteChatStore;
