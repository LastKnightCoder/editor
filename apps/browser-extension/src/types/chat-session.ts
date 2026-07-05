import type { ChatMessageType } from "@tau/shared";

export type ChatAgentType = "local" | "codex";

/**
 * 聊天会话元数据
 * 用于管理浏览器扩展中的聊天会话
 */
export interface ChatSession {
  /** 会话唯一标识 */
  id: string;
  /** 会话标题 */
  title: string;
  /** 创建时间戳 */
  createTime: number;
  /** 最后更新时间戳 */
  updateTime: number;
  /** 父会话 ID（用于分支关系） */
  parentChatId?: string | null;
  /** 分支序号（同一父会话下的第几个分支） */
  branchIndex?: number;
  /** 是否已归档 */
  archived?: boolean;
  /** 会话数据结构版本 */
  schemaVersion?: number;
  /** 创建会话时固化的 system prompt 快照 */
  systemPromptSnapshot?: string;
  /** 当前会话使用的聊天代理 */
  agentType?: ChatAgentType;
  /** Codex 侧线程 ID，用于继续同一代理会话 */
  agentSessionId?: string | null;
}

/**
 * 重新导出共享包的消息类型
 */
export type { ChatMessageType };
