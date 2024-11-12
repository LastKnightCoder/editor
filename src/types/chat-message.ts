import { Message } from "@/types";

export interface ChatMessage {
  id: number;
  createTime: number;
  updateTime: number;
  messages: Message[];
  title: string;
}
