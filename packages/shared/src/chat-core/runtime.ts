import type { ChatInputAreaServices, ThinkingLevel } from "../components/ChatInputArea/types";
import type { ChatModelCore, ChatProviderCore, ChatSessionCore } from "./types";

export interface ChatRuntimeSettings {
  providers: ChatProviderCore[];
  currentModel: ChatModelCore | null;
  skillsPrompt?: string;
  canEnableRag: boolean;
}

export interface ChatRuntimeCallbacks {
  createChat: (messages: ChatSessionCore["messages"], title?: string) => Promise<ChatSessionCore>;
  createBranch: (
    parentChatId: ChatSessionCore["id"],
    messages: ChatSessionCore["messages"]
  ) => Promise<ChatSessionCore>;
  updateChat: (chat: ChatSessionCore) => Promise<ChatSessionCore>;
  updateCurrentChat: (chat: ChatSessionCore) => void;
}

export interface ChatRuntimeStream {
  sendMessage: (
    input: string,
    options?: {
      thinkingLevel?: ThinkingLevel;
    }
  ) => Promise<void>;
  stopGeneration: () => void;
}

export interface ChatRuntimeAdapter {
  settings: ChatRuntimeSettings;
  callbacks: ChatRuntimeCallbacks;
  stream: ChatRuntimeStream;
  chatInputServices: ChatInputAreaServices;
}
