import { useDatabaseChangeEffect } from "./useDatabaseChangeEffect";
import useChatSessionStore, { MAIN_CHAT_BUCKET } from "@/stores/useChatSessionStore";

/**
 * 全局初始化聊天数据的 Hook
 *
 * 在数据库连接或切换时加载主聊天的会话目录与对话分组（只有元数据，消息打开时才读 JSONL）。
 * 其它场景（PDF / 视频笔记 / 学习项目）的列表由各自面板按所属对象加载。
 * 应该在应用顶层（如 App.tsx）调用一次。
 */
export const useInitChatData = () => {
  useDatabaseChangeEffect(() => {
    const store = useChatSessionStore.getState();
    // 切库：旧库已打开的对话作废、已加载的列表按新库重读
    void store.reloadAll().then(() => store.loadBucket(MAIN_CHAT_BUCKET));
    void store.loadGroups();
  });
};
