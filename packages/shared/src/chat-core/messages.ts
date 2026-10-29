/**
 * 统一消息模型：桌面端与浏览器插件共用的会话记录、请求/响应消息与流式块类型。
 * 桌面 src/types/llm.ts、src/types/chat-message.ts、src/types/tool.ts 对本文件为 re-export 关系，
 * 两端禁止再各自定义同名类型。
 */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ChatSessionSource = "desktop" | "mobile" | "browser";
export type MentionEntityType = "card" | "article" | "project-item";

export interface MentionRef {
  entityType: MentionEntityType;
  entityId: number;
  contentId: number;
  title: string;
  previewText: string;
}

export enum Role {
  User = "user",
  Assistant = "assistant",
  System = "system",
  Tool = "tool",
}

export interface TextContent {
  type: "text";
  text: string;
  mentions?: MentionRef[];
  /** 本条消息用 `$` 点名的 Skill（folderName），发送时注入全文（D-060） */
  skills?: string[];
}

export interface ImageContent {
  type: "image";
  image: string; // base64 或 url
  path?: string; // 原始本地路径，用于解析历史附件
  resourceId?: number; // 仅兼容历史消息，不再用于资源查询
}

export interface FileContent {
  type: "file";
  file: string;
  resourceId?: number; // 仅兼容历史消息，不再用于资源查询
  fileName?: string;
}

export type MessageContent = TextContent | ImageContent | FileContent;

export type ProviderMetadata = Record<string, unknown>;

export interface ToolCallPayload {
  id: string;
  type?: string;
  function: {
    name: string;
    arguments?: string;
  };
}

export type ToolCallStatus =
  | "pending"
  | "executing"
  | "success"
  | "failed"
  | "retrying"
  | "cancelled"
  | "awaiting-approval";

/** 工具调用执行状态详情 */
export interface ToolCallExecutionState {
  toolCallId: string;
  toolName: string;
  status: ToolCallStatus;
  input: string;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  /** 错误类型：parameter 为参数错误（已反馈模型纠正），execution 为执行失败（已自动重试） */
  errorType?: "parameter" | "execution";
  /** 首次进入 pending 的时间戳 */
  timestamp: number;
  duration?: number;
  /** 自动重试次数（仅用于执行失败的自动重试场景） */
  retryCount?: number;
}

export type AssistantBlockState = "streaming" | "final";

export interface AssistantTextBlock {
  id: string;
  turnId: string;
  type: "text";
  state: AssistantBlockState;
  content: string;
}

export interface AssistantReasoningBlock {
  id: string;
  turnId: string;
  type: "reasoning";
  state: AssistantBlockState;
  content: string;
  startTime?: number;
  endTime?: number;
  duration?: number;
}

export interface AssistantToolCallBlock {
  id: string;
  turnId: string;
  type: "tool_call";
  state: AssistantBlockState;
  toolCall: ToolCallPayload;
  execution?: ToolCallExecutionState;
}

/** 流式助手块：文本/思考/工具调用按 turn 顺序交替出现 */
export type AssistantBlock = AssistantTextBlock | AssistantReasoningBlock | AssistantToolCallBlock;

/** 内容块：ChatMessageType.contentBlocks 的展示层结构 */
export type ResponseContentBlock =
  | {
      type: "text";
      content: string;
    }
  | {
      type: "reasoning";
      content: string;
      startTime?: number; // 开始思考的时间戳（毫秒）
      endTime?: number; // 结束思考的时间戳（毫秒）
      duration?: number; // 思考持续时间（毫秒）
    }
  | {
      type: "tool_calls";
      executions: ToolCallExecutionState[];
    };

/** ContentBlock 为 ResponseContentBlock 的兼容别名（历史导出名） */
export type ContentBlock = ResponseContentBlock;

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  providerId?: string;
  modelId?: string;
  modelName?: string;
}

export interface MessageVersions {
  ids: string[];
  index: number;
}

export interface RequestMessage {
  clientId?: string;
  /**
   * 对应的 pi 会话 entry id（M4：从 JSONL 投影出来的消息才有）。改历史操作（删除/编辑重发/
   * 重新生成）按它定位，不能靠 clientId——迁移数据的 clientId 是旧值。
   */
  piEntryIds?: string[];
  /**
   * 会话树上同一位置的全部版本（M4-d：编辑重发/重新生成/从这里建分支产生的兄弟）。
   * ids 为各版本用户消息的 entry id（写入顺序），index 是本条是第几个；只有一个版本时不带。
   */
  piVersions?: MessageVersions;
  role: Role;
  content: MessageContent[] | string;
  reasoning_content?: string;
  provider_metadata?: ProviderMetadata;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallPayload[];
}

export interface ResponseMessage {
  clientId?: string;
  /** 一条回答的全部 pi entry id（assistant + toolResult）：删除回答要全部省略，否则只删一半 */
  piEntryIds?: string[];
  role: Role;
  content: string;
  reasoning_content?: string;
  provider_metadata_by_turn?: Record<string, ProviderMetadata>;
  tool_calls?: ToolCallPayload[];
  assistant_blocks?: AssistantBlock[];
  usage?: ModelUsage;
}

export type ChatSessionMessage = RequestMessage | ResponseMessage;

/**
 * 一个已打开的对话（M4：会话目录行 + pi JSONL 投影出的消息）。注意与 ChatComponents 的
 * ChatMessage（单条消息）区分，桌面历史代码以 `ChatMessage` 名字消费本类型。
 *
 * id 即 pi 会话 id（字符串）：新对话在渲染端生成 id，目录表里查不到就是草稿，
 * 首轮发送后才登记目录行，id 从头到尾不变。
 */
export interface ChatSessionRecord {
  /** 桌面投影所属库，不属于消息内容。 */
  databaseName?: string;
  id: string;
  createTime: number;
  updateTime: number;
  messages: ChatSessionMessage[];
  title: string;
  titleDirty?: boolean;
  groupId?: number | null;
  archived?: boolean;
  orderNum?: number | null; // 排序序号（用于置顶和拖拽排序）
  /** 会话创建来源不限制其他设备继续读取或执行。 */
  source?: ChatSessionSource;
  /** 相对会话目录的 JSONL 文件名；草稿（尚未登记）为空 */
  sessionFile?: string;
  /** 聊天场景（main-chat / pdf-chat / …）与所属对象 */
  scope?: string;
  domainRef?: string | null;
}

export interface ChatGroup {
  id: number;
  name: string;
  parentId: number | null;
  orderIndex: number;
  createTime: number;
  updateTime: number;
}

export interface CreateChatGroup {
  name: string;
  parentId?: number | null;
  orderIndex?: number;
}

export interface UpdateChatGroup {
  id: number;
  name?: string;
  parentId?: number | null;
  orderIndex?: number;
}
