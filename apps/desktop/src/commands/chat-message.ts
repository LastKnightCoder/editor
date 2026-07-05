import { invoke } from "@/electron";
import {
  ChatMessage,
  ChatSessionMessage,
  ChatGroup,
  CreateChatGroup,
  UpdateChatGroup,
  ChatAgentType,
} from "@/types";

export const createChatMessage = (
  messages: ChatSessionMessage[],
  title = "新对话",
  groupId?: number | null,
  parentChatId?: number | null,
  branchIndex?: number,
  orderNum?: number | null,
  titleDirty?: boolean,
  agentType?: ChatAgentType,
  agentSessionId?: string | null,
): Promise<ChatMessage> => {
  return invoke(
    "create-chat-message",
    messages,
    title,
    groupId,
    parentChatId,
    branchIndex,
    orderNum,
    titleDirty,
    agentType,
    agentSessionId,
  );
};

export const getChatMessageById = (id: number): Promise<ChatMessage> => {
  return invoke("get-chat-message-by-id", id);
};

export const updateChatMessage = (
  chatMessage: Omit<ChatMessage, "updateTime">,
): Promise<ChatMessage> => {
  return invoke("update-chat-message", chatMessage);
};

export const deleteChatMessage = (id: number): Promise<number> => {
  return invoke("delete-chat-message", id);
};

export const getAllChatMessages = (): Promise<ChatMessage[]> => {
  return invoke("get-all-chat-messages");
};

export const getChatBranches = (
  parentChatId: number,
): Promise<ChatMessage[]> => {
  return invoke("get-chat-branches", parentChatId);
};

export const getNextBranchIndex = (parentChatId: number): Promise<number> => {
  return invoke("get-next-branch-index", parentChatId);
};

export const getChildBranchesCount = (
  parentChatId: number,
): Promise<number> => {
  return invoke("get-child-branches-count", parentChatId);
};

export const createChatGroup = (data: CreateChatGroup): Promise<ChatGroup> => {
  return invoke("chat-group:create", data);
};

export const updateChatGroup = (data: UpdateChatGroup): Promise<ChatGroup> => {
  return invoke("chat-group:update", data);
};

export const deleteChatGroup = (id: number): Promise<number> => {
  return invoke("chat-group:delete", id);
};

export const getAllChatGroups = (): Promise<ChatGroup[]> => {
  return invoke("chat-group:get-all");
};

export const getChatGroupById = (id: number): Promise<ChatGroup> => {
  return invoke("chat-group:get-by-id", id);
};

export const pinChatMessage = (id: number): Promise<ChatMessage> => {
  return invoke("pin-chat-message", id);
};

export const unpinChatMessage = (id: number): Promise<ChatMessage> => {
  return invoke("unpin-chat-message", id);
};

export const reorderChatMessage = (
  id: number,
  newOrder: number,
): Promise<ChatMessage> => {
  return invoke("reorder-chat-message", id, newOrder);
};
