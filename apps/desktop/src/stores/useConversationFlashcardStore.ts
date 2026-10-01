import { create } from "zustand";

interface ConversationFlashcardState {
  // 弹窗状态
  isModalOpen: boolean;

  // 生成上下文
  conversationContent: string | null; // Markdown 格式对话内容
  chatGroupId: number | null; // 聊天会话 ID
  chatTitle: string | null; // 聊天标题

  // Actions
  openGenerationModal: (params: {
    conversationContent: string;
    chatGroupId: number;
    chatTitle: string;
  }) => void;
  closeModal: () => void;
  reset: () => void;
}

const useConversationFlashcardStore = create<ConversationFlashcardState>(
  (set) => ({
    // 初始状态
    isModalOpen: false,
    conversationContent: null,
    chatGroupId: null,
    chatTitle: null,

    // Actions
    openGenerationModal: (params) =>
      set({
        isModalOpen: true,
        conversationContent: params.conversationContent,
        chatGroupId: params.chatGroupId,
        chatTitle: params.chatTitle,
      }),

    closeModal: () =>
      set({
        isModalOpen: false,
      }),

    reset: () =>
      set({
        isModalOpen: false,
        conversationContent: null,
        chatGroupId: null,
        chatTitle: null,
      }),
  }),
);

export default useConversationFlashcardStore;
