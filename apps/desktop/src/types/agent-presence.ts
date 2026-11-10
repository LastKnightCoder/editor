/** Agent 在某篇正文上的在场：谁在、在干什么。不落库，Agent 一轮结束即清除。 */

/** 主进程广播：某篇正文上的 Agent 在场变化，载荷为 AgentPresenceChange */
export const CONTENT_AGENT_PRESENCE_CHANGED = "content-agent-presence:changed";

/** busy 正在干活；waiting 在等你处理（建议、提问）；idle 在场但没动作 */
export type AgentPresenceStatus = "busy" | "waiting" | "idle";

export interface AgentPresenceUpdate {
  /** Agent 职责名（与建议署名同源） */
  agent: string;
  /** 发起它的对话（会话键）；对话这一轮结束时据此清除 */
  owner: string;
  status: AgentPresenceStatus;
  /** 一句人话说当前在做什么，如「正在读正文」「等你处理 3 条建议」 */
  action: string;
  /** 光标位置：范围编辑的锚点（JSON 相对位置），光标画在 end 处 */
  caret?: { blockId: string; position: string };
  /** 正在看 / 正在改的块（collabId） */
  block?: string;
  /** 正在改（直接改实时落地）时为 true，块整块圈出 */
  editing?: boolean;
}

export interface AgentPresence {
  agent: string;
  status: AgentPresenceStatus;
  action: string;
  updatedAt: number;
}

export interface AgentPresenceChange {
  databaseName: string;
  contentId: number;
}

/** awareness 里 Agent 状态的 agent 字段（渲染端据此画「正在看 / 改这段」） */
export interface AgentAwarenessState {
  status: AgentPresenceStatus;
  action: string;
  block?: string;
  editing?: boolean;
}
