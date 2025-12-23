import type { ToolParameterSchema } from "@/types";
import useConversationFlashcardStore from "@/stores/useConversationFlashcardStore";
import type { MCPProviderDefinition } from "./types";

export const flashcardToolsProvider: MCPProviderDefinition = {
  id: "flashcard-tools",
  name: "闪卡工具",
  description: "提供从对话内容生成闪卡的工具",
  defaultEnabled: true,
  tools: () => [
    {
      name: "generate_flashcards_from_conversation",
      description:
        "分析对话内容并生成闪卡。调用后会打开弹窗让用户选择和编辑卡片，生成的闪卡会自动关联到当前聊天会话作为参考来源。请在调用此工具时，将对话中的重要知识点整理为 Markdown 格式的总结内容。",
      parameters: {
        type: "object",
        properties: {
          conversation_summary: {
            type: "string",
            description:
              "对话内容的 Markdown 格式总结，包含所有需要生成闪卡的知识点。请将对话中的重要信息整理为清晰的要点或段落。",
          },
          chat_group_id: {
            type: "number",
            description: "当前聊天会话的 group ID，用于关联闪卡参考来源",
          },
          chat_title: {
            type: "string",
            description: "聊天会话的标题，用于闪卡参考来源显示",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["conversation_summary", "chat_group_id", "chat_title"],
        additionalProperties: false,
      },
      executor: async (args) => {
        const store = useConversationFlashcardStore.getState();
        store.openGenerationModal({
          conversationContent: args.conversation_summary as string,
          chatGroupId: args.chat_group_id as number,
          chatTitle: args.chat_title as string,
        });
        return {
          content:
            "已启动闪卡生成流程，请在弹出的对话框中选择和编辑要保存的闪卡。",
        };
      },
    },
  ],
};
