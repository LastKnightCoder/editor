/**
 * 助手消息块组装逻辑已统一到 @tau/shared/chat-core（assistantBlocks.ts），本文件仅 re-export。
 * 注意走子路径导入：主进程 bundle 会包含本文件，不能引 @tau/shared 主入口（UI 包）。
 */
export {
  syncAssistantDerivedFields,
  ensureAssistantMessage,
  getAssistantToolExecutions,
  getAssistantContentBlocks,
  createAssistantMessage,
  applyAssistantTextSnapshot,
  applyAssistantReasoningSnapshot,
  applyAssistantToolCallsSnapshot,
  finalizeAssistantTurn,
  applyAssistantProviderMetadataSnapshot,
  buildAssistantHistoryMessages,
} from "@tau/shared/chat-core";
