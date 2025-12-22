import { ChatSessionMessage } from "@/types";

export interface ChatMessage {
  id: number;
  createTime: number;
  updateTime: number;
  messages: ChatSessionMessage[];
  title: string;
  groupId?: number | null;
  archived?: boolean;
  promptId?: number | null;
  parentChatId?: number | null; // 父对话 ID（用于分支关系）
  branchIndex?: number; // 分支序号（同一父对话下的第几个分支）
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
