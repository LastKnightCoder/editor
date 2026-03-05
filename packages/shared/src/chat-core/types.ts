import type { ChatMessage as ChatMessageType } from "../components/ChatComponents/types";

export interface ChatSessionCore {
  id: string | number;
  title: string;
  createTime: number;
  updateTime: number;
  parentChatId?: string | number | null;
  branchIndex?: number;
  archived?: boolean;
  promptId?: number | null;
  messages: ChatMessageType[];
}

export interface ChatPromptCore {
  id: number;
  name: string;
  tags: string[];
  content: string;
}

export interface ChatModelFeaturesCore {
  online: boolean;
  thinking: boolean;
  image: boolean;
  video: boolean;
  audio: boolean;
  file: boolean;
  multimodal?: boolean;
}

export interface ChatModelCore {
  name: string;
  description: string;
  features: ChatModelFeaturesCore;
}

export interface ChatProviderCore {
  id: string;
  name: string;
  models: ChatModelCore[];
}
