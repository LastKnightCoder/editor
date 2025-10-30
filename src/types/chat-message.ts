import { ChatSessionMessage } from "@/types";

export interface ChatMessage {
  id: number;
  createTime: number;
  updateTime: number;
  messages: ChatSessionMessage[];
  title: string;
  groupId?: number | null;
  archived?: boolean;
}

export interface ChatGroup {
  id: number;
  name: string;
  parentId: number | null;
  orderIndex: number;
  createTime: number;
  updateTime: number;
}

export interface CreateChatGroup {
  name: string;
  parentId?: number | null;
  orderIndex?: number;
}

export interface UpdateChatGroup {
  id: number;
  name?: string;
  parentId?: number | null;
  orderIndex?: number;
}
