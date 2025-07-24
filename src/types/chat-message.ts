import { ChatSessionMessage } from "@/types";

export interface ChatMessage {
  id: number;
  createTime: number;
  updateTime: number;
  messages: ChatSessionMessage[];
  title: string;
}
