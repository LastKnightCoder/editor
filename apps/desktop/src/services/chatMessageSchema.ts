/**
 * 消息 schema 迁移逻辑已统一到 @tau/shared/chat-core（messageSchema.ts），本文件仅 re-export。
 * 注意走子路径导入：主进程 bundle 会包含本文件，不能引 @tau/shared 主入口（UI 包）。
 */
export {
  CHAT_MESSAGE_SCHEMA_VERSION,
  createChatMessageClientId,
  migrateAssistantMessage,
  migrateChatSessionMessages,
  getAssistantToolExecutionsFromBlocks,
} from "@tau/shared/src/chat-core/messageSchema";
