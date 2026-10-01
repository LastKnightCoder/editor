import { create } from "zustand";

/** 生成闪卡的素材出处：哪段对话的哪几条消息（写谱系 saved_from 用） */
export interface ConversationFlashcardSource {
  /** chat_session.id（= pi 会话 id） */
  sessionId: string;
  messageIds: string[];
}

interface ConversationFlashcardState {
  isModalOpen: boolean;
  /** Markdown 格式的对话素材 */
  conversationContent: string | null;
  source: ConversationFlashcardSource | null;
  chatTitle: string | null;

  openGenerationModal: (params: {
    conversationContent: string;
    source: ConversationFlashcardSource;
    chatTitle: string;
  }) => void;
  closeModal: () => void;
  reset: () => void;
}

const useConversationFlashcardStore = create<ConversationFlashcardState>(set => ({
  isModalOpen: false,
  conversationContent: null,
  source: null,
  chatTitle: null,

  openGenerationModal: params =>
    set({
      isModalOpen: true,
      conversationContent: params.conversationContent,
      source: params.source,
      chatTitle: params.chatTitle,
    }),

  closeModal: () => set({ isModalOpen: false }),

  reset: () =>
    set({
      isModalOpen: false,
      conversationContent: null,
      source: null,
      chatTitle: null,
    }),
}));

export default useConversationFlashcardStore;
