import { create } from "zustand";
import { produce } from "immer";
import { VLChatMessage, CreateVLChat } from "@/types/vibe-learning";
import { ChatSessionMessage } from "@/types";
import {
  createVLChat,
  updateVLChat,
  deleteVLChat,
  getVLChatsByProjectId,
  getVLChatBranches,
  getVLNextBranchIndex,
  getVLChildBranchesCount,
} from "@/commands/vibe-learning";

export enum EVLChatStatus {
  UN_INIT,
  LOADING,
  SUCCESS,
  FAIL,
}

interface IState {
  projectId: number | null;
  currentChatId: number | null;
  chats: VLChatMessage[];
  status: EVLChatStatus;
}

interface IAction {
  // 初始化
  initChats: (projectId: number) => Promise<void>;
  reset: () => void;

  // CRUD 操作
  createChat: (
    messages: ChatSessionMessage[],
    title?: string,
  ) => Promise<VLChatMessage>;
  updateChat: (
    chat: Omit<VLChatMessage, "updateTime">,
  ) => Promise<VLChatMessage>;
  updateCurrentChat: (chat: VLChatMessage) => void;
  deleteChat: (id: number) => Promise<void>;

  // 分支相关
  createChatBranch: (
    parentChatId: number,
    messages: ChatSessionMessage[],
    title?: string,
  ) => Promise<VLChatMessage>;
  getChatBranches: (parentChatId: number) => Promise<VLChatMessage[]>;
  getChildBranchesCount: (parentChatId: number) => Promise<number>;
}

const useVLChatStore = create<IState & IAction>()((set, get) => ({
  projectId: null,
  currentChatId: null,
  chats: [],
  status: EVLChatStatus.UN_INIT,

  initChats: async (projectId: number) => {
    set({ status: EVLChatStatus.LOADING, projectId });
    try {
      const chats = await getVLChatsByProjectId(projectId);
      set({
        chats,
        status: EVLChatStatus.SUCCESS,
        // 如果有对话，默认选中最新的一个
        currentChatId: chats.length > 0 ? chats[0].id : null,
      });
    } catch (error) {
      console.error("Failed to init VL chats:", error);
      set({ status: EVLChatStatus.FAIL });
    }
  },

  reset: () => {
    set({
      projectId: null,
      currentChatId: null,
      chats: [],
      status: EVLChatStatus.UN_INIT,
    });
  },

  createChat: async (messages, title) => {
    const { projectId, chats } = get();
    if (!projectId) {
      throw new Error("Project ID is not set");
    }

    const params: CreateVLChat = {
      projectId,
      messages,
      title: title || "新对话",
    };

    const createdChat = await createVLChat(params);
    const newChats = produce(chats, (draft) => {
      draft.unshift(createdChat);
    });

    set({ chats: newChats, currentChatId: createdChat.id });
    return createdChat;
  },

  updateChat: async (chat) => {
    const { chats } = get();
    const updatedChat = await updateVLChat({
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
      const index = draft.findIndex((c) => c.id === updatedChat.id);
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
      const index = draft.findIndex((c) => c.id === chat.id);
      if (index !== -1) {
        draft[index] = chat;
      }
    });
    set({ chats: newChats, currentChatId: chat.id });
  },

  deleteChat: async (id) => {
    const { chats, currentChatId } = get();
    await deleteVLChat(id);

    // 获取所有需要删除的对话 ID（包括子分支）
    const chatToDelete = chats.find((c) => c.id === id);
    const allIdsToDelete = new Set<number>([id]);
    if (chatToDelete) {
      // 递归查找所有子分支
      const findChildren = (parentId: number) => {
        chats.forEach((chat) => {
          if (chat.parentChatId === parentId) {
            allIdsToDelete.add(chat.id);
            findChildren(chat.id);
          }
        });
      };
      findChildren(id);
    }

    const newChats = produce(chats, (draft) => {
      // 删除所有相关的对话（包括子分支）
      return draft.filter((c) => !allIdsToDelete.has(c.id));
    });

    // 如果删除的是当前选中的对话，选中下一个
    let newCurrentChatId = currentChatId;
    if (allIdsToDelete.has(currentChatId!)) {
      newCurrentChatId = newChats.length > 0 ? newChats[0].id : null;
    }

    set({ chats: newChats, currentChatId: newCurrentChatId });
  },

  createChatBranch: async (parentChatId, messages, title) => {
    const { projectId, chats } = get();
    if (!projectId) {
      throw new Error("Project ID is not set");
    }

    const parentChat = chats.find((c) => c.id === parentChatId);
    if (!parentChat) {
      throw new Error("Parent chat not found");
    }

    // 获取下一个分支序号
    const branchIndex = await getVLNextBranchIndex(parentChatId);
    const branchTitle =
      title || `${parentChat.title} - 分支 ${branchIndex + 1}`;

    const params: CreateVLChat = {
      projectId,
      messages,
      title: branchTitle,
      parentChatId,
      branchIndex,
    };

    const createdBranch = await createVLChat(params);
    const newChats = produce(chats, (draft) => {
      draft.unshift(createdBranch);
    });

    set({ chats: newChats, currentChatId: createdBranch.id });
    return createdBranch;
  },

  getChatBranches: async (parentChatId) => {
    return await getVLChatBranches(parentChatId);
  },

  getChildBranchesCount: async (parentChatId) => {
    return await getVLChildBranchesCount(parentChatId);
  },
}));

export default useVLChatStore;
