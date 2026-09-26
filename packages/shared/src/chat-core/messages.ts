/**
 * 统一消息模型：桌面端与浏览器插件共用的会话记录、请求/响应消息与流式块类型。
 * 桌面 src/types/llm.ts、src/types/chat-message.ts、src/types/tool.ts 对本文件为 re-export 关系，
 * 两端禁止再各自定义同名类型。
 */
import type { MentionRef } from "../components/ChatInputArea/types";

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
  "pending" | "executing" | "success" | "failed" | "retrying" | "cancelled";

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
  modelName?: string;
}

export interface RequestMessage {
  clientId?: string;
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
 * 会话记录（数据库行结构）。注意与 ChatComponents 的 ChatMessage（单条消息）区分，
 * 桌面历史代码以 `ChatMessage` 名字消费本类型，经 re-export 别名保持兼容。
 */
export interface ChatSessionRecord {
  id: number;
  createTime: number;
  updateTime: number;
  messages: ChatSessionMessage[];
  messageSchemaVersion?: number;
  title: string;
  titleDirty?: boolean;
  groupId?: number | null;
  archived?: boolean;
  parentChatId?: number | null; // 父对话 ID（用于分支关系）
  branchIndex?: number; // 分支序号（同一父对话下的第几个分支）
  orderNum?: number | null; // 排序序号（用于置顶和拖拽排序）
  /** 会话来源：desktop 为桌面端创建，browser 为浏览器插件创建 */
  source?: "desktop" | "browser";
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
