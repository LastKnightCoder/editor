import { useDatabaseChangeEffect } from "./useDatabaseChangeEffect";
import useChatMessageStore from "@/stores/useChatMessageStore";
import usePromptStore from "@/stores/usePromptStore";

/**
 * 全局初始化聊天数据的 Hook
 *
 * 在数据库连接或切换时自动加载聊天消息、聊天分组和提示词数据。
 * 应该在应用顶层（如 App.tsx）调用一次。
 */
export const useInitChatData = () => {
  const initChatMessage = useChatMessageStore((state) => state.initChatMessage);
  const initChatGroups = useChatMessageStore((state) => state.initChatGroups);
  const initPrompts = usePromptStore((state) => state.initPrompts);

  useDatabaseChangeEffect(() => {
    initChatMessage();
    initChatGroups();
    initPrompts();
  });
};
