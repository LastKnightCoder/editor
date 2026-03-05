import type {
  ChatInputAreaServices,
  ReasoningEffort,
} from "../components/ChatInputArea/types";
import type {
  ChatModelCore,
  ChatPromptCore,
  ChatProviderCore,
  ChatSessionCore,
} from "./types";

export interface ChatRuntimeSettings {
  providers: ChatProviderCore[];
  currentModel: ChatModelCore | null;
  prompts: ChatPromptCore[];
  skillsPrompt?: string;
  canEnableRag: boolean;
}

export interface ChatRuntimeCallbacks {
  createChat: (
    messages: ChatSessionCore["messages"],
    title?: string,
  ) => Promise<ChatSessionCore>;
  createBranch: (
    parentChatId: ChatSessionCore["id"],
    messages: ChatSessionCore["messages"],
  ) => Promise<ChatSessionCore>;
  updateChat: (chat: ChatSessionCore) => Promise<ChatSessionCore>;
  updateCurrentChat: (chat: ChatSessionCore) => void;
}

export interface ChatRuntimeStream {
  sendMessage: (
    input: string,
    options?: {
      ragEnabled?: boolean;
      reasoningEffort?: ReasoningEffort;
      promptId?: number | null;
    },
  ) => Promise<void>;
  stopGeneration: () => void;
}

export interface ChatRuntimeAdapter {
  settings: ChatRuntimeSettings;
  callbacks: ChatRuntimeCallbacks;
  stream: ChatRuntimeStream;
  chatInputServices: ChatInputAreaServices;
}
