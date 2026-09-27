import type { ChatMessageType } from "@tau/shared";

/**
 * 扩展对话元数据（M4.5）：对话是桌面按页面存放的 pi 会话文件，见 services/chatStoreClient。
 * 新对话在首轮回答之前是本地草稿（id 已生成，桌面还没有文件），不出现在列表里。
 */
export interface ChatSession {
  /** pi 会话 id */
  id: string;
  /** 会话标题（pi session name；没起名时为首条用户消息） */
  title: string;
  /** 创建时间戳 */
  createTime: number;
  /** 最后更新时间戳 */
  updateTime: number;
  /** 父会话 id（分支关系，来自会话头 parentSession） */
  parentChatId?: string | null;
  /** 本地草稿（还没发过消息） */
  draft?: boolean;
}

/**
 * 重新导出共享包的消息类型
 */
export type { ChatMessageType };
