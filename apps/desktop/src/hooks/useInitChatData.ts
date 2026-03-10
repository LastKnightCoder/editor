import { useDatabaseChangeEffect } from "./useDatabaseChangeEffect";
import useChatMessageStore from "@/stores/useChatMessageStore";

/**
 * 全局初始化聊天数据的 Hook
 *
 * 在数据库连接或切换时自动加载聊天消息和聊天分组数据。
 * 应该在应用顶层（如 App.tsx）调用一次。
 */
export const useInitChatData = () => {
  const initChatMessage = useChatMessageStore((state) => state.initChatMessage);
  const initChatGroups = useChatMessageStore((state) => state.initChatGroups);

  useDatabaseChangeEffect(() => {
    initChatMessage();
    initChatGroups();
  });
};
