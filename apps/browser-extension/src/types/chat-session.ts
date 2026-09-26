import type { ChatMessageType } from "@tau/shared";

/**
 * 聊天会话元数据（会话存储统一在桌面端 sqlite，见 services/chatStoreClient）。
 * systemPromptSnapshot 为内存派生态：持久化形态是会话 messages 首条 system 消息。
 */
export interface ChatSession {
  /** 会话唯一标识（桌面 sqlite 行 id） */
  id: number;
  /** 会话标题 */
  title: string;
  /** 创建时间戳 */
  createTime: number;
  /** 最后更新时间戳 */
  updateTime: number;
  /** 父会话 ID（用于分支关系） */
  parentChatId?: number | null;
  /** 分支序号（同一父会话下的第几个分支） */
  branchIndex?: number;
  /** 是否已归档 */
  archived?: boolean;
  /** 创建会话时固化的 system prompt 快照 */
  systemPromptSnapshot?: string;
}

/**
 * 重新导出共享包的消息类型
 */
export type { ChatMessageType };
