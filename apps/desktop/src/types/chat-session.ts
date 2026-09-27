/**
 * pi 会话目录表（chat_session）的跨进程类型（M4）。
 * 会话内容的事实源是 pi JSONL，目录表只存列表与管理要用的轻量元数据。
 */

/** 五个聊天场景（scope）；domainRef 指向所属对象，主聊天为 null */
export type ChatSessionScope = "main-chat" | "pdf-chat" | "video-note-chat" | "vibe-learning-chat";

export interface ChatSessionRow {
  /** pi 会话 id（= JSONL 头部 id = 会话键的后半段） */
  id: string;
  scope: string;
  domainRef: string | null;
  /** 相对当前库会话目录的文件名（不存绝对路径） */
  sessionFile: string;
  cwd: string;
  title: string;
  titleDirty: boolean;
  groupId: number | null;
  orderNum: number | null;
  archived: boolean;
  source: "desktop" | "browser";
  messageCount: number;
  parentSessionId: string | null;
  branchIndex: number;
  createTime: number;
  updateTime: number;
}

export interface ChatSessionInsert {
  id: string;
  scope: string;
  domainRef?: string | null;
  sessionFile: string;
  cwd?: string;
  title?: string;
  titleDirty?: boolean;
  groupId?: number | null;
  orderNum?: number | null;
  archived?: boolean;
  source?: "desktop" | "browser";
  messageCount?: number;
  parentSessionId?: string | null;
  branchIndex?: number;
  /** 迁移时保留原行的时间，正常创建留空取当前时间 */
  createTime?: number;
  updateTime?: number;
}

export type ChatSessionPatch = Partial<Omit<ChatSessionRow, "id" | "createTime">>;

export interface ChatSessionListFilter {
  scope?: string;
  /** undefined = 不按对象过滤；null = 只要无所属对象的（主聊天） */
  domainRef?: string | null;
  includeArchived?: boolean;
  includeBranches?: boolean;
  limit?: number;
}
