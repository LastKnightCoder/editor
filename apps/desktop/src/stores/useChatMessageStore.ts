import { create } from "zustand";
import { ChatMessage, ChatGroup, ChatAgentType } from "@/types";
import {
  createChatMessage,
  deleteChatMessage,
  updateChatMessage,
  getAllChatMessages,
  createChatGroup,
  updateChatGroup,
  deleteChatGroup,
  getAllChatGroups,
  getChatBranches,
  getNextBranchIndex,
  getChildBranchesCount,
  pinChatMessage,
  unpinChatMessage,
  reorderChatMessage,
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
    titleDirty?: boolean,
    agentType?: ChatAgentType,
    agentSessionId?: string | null,
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
  // 分支相关
  createChatBranch: (
    parentChatId: number,
    messages: ChatMessage["messages"],
    title?: string,
    agentType?: ChatAgentType,
  ) => Promise<ChatMessage>;
  getChatBranches: (parentChatId: number) => Promise<ChatMessage[]>;
  getChildBranchesCount: (parentChatId: number) => Promise<number>;
  // 置顶和排序相关
  pinChatMessage: (id: number) => Promise<ChatMessage>;
  unpinChatMessage: (id: number) => Promise<ChatMessage>;
  reorderChatMessage: (id: number, newOrder: number) => Promise<ChatMessage>;
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
      createChatMessage: async (
        messages,
        title,
        groupId,
        titleDirty,
        agentType,
        agentSessionId,
      ) => {
        const { chats } = get();
        const createdChatMessage = await createChatMessage(
          messages,
          title,
          groupId,
          null, // parentChatId
          undefined, // branchIndex
          null, // orderNum
          titleDirty ?? false,
          agentType ?? "local",
          agentSessionId ?? null,
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
        const deletedCount = await deleteChatMessage(id);

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

        // 如果删除的是当前选中的对话，清空选中
        const { currentChatId } = get();
        const newCurrentChatId = allIdsToDelete.has(currentChatId!)
          ? null
          : currentChatId;

        set({ chats: newChats, currentChatId: newCurrentChatId });
        return deletedCount;
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
      createChatBranch: async (parentChatId, messages, title, agentType) => {
        const { chats } = get();
        const parentChat = chats.find((c) => c.id === parentChatId);
        if (!parentChat) throw new Error("Parent chat not found");

        // 获取下一个分支序号
        const branchIndex = await getNextBranchIndex(parentChatId);
        const branchTitle =
          title || `${parentChat.title} - 分支 ${branchIndex + 1}`;

        // 创建分支对话（直接传入 parentChatId 和 branchIndex）
        const createdBranchChat = await createChatMessage(
          messages,
          branchTitle,
          parentChat.groupId,
          parentChatId,
          branchIndex,
          undefined,
          true,
          agentType ?? parentChat.agentType ?? "local",
          null,
        );

        const newChats = produce(chats, (draft) => {
          draft.push(createdBranchChat);
        });
        set({ chats: newChats, currentChatId: createdBranchChat.id });

        return createdBranchChat;
      },
      getChatBranches: async (parentChatId) => {
        return getChatBranches(parentChatId);
      },

      getChildBranchesCount: async (parentChatId) => {
        return getChildBranchesCount(parentChatId);
      },
      pinChatMessage: async (id) => {
        const { chats } = get();
        const result = await pinChatMessage(id);
        const newChats = produce(chats, (draft) => {
          const index = draft.findIndex((c) => c.id === id);
          if (index !== -1) {
            draft[index] = result;
          }
        });
        set({ chats: newChats });
        return result;
      },
      unpinChatMessage: async (id) => {
        const { chats } = get();
        const result = await unpinChatMessage(id);
        const newChats = produce(chats, (draft) => {
          const index = draft.findIndex((c) => c.id === id);
          if (index !== -1) {
            draft[index] = result;
          }
        });
        set({ chats: newChats });
        return result;
      },
      reorderChatMessage: async (id, newOrder) => {
        const { chats } = get();
        const result = await reorderChatMessage(id, newOrder);
        const newChats = produce(chats, (draft) => {
          const index = draft.findIndex((c) => c.id === id);
          if (index !== -1) {
            draft[index] = result;
          }
        });
        set({ chats: newChats });
        return result;
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
