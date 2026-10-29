import type { ReactNode } from "react";
import type { MentionRef, MessageContent, ThinkingLevel } from "../../chat-core/messages";
export type { MentionEntityType, MentionRef, ThinkingLevel } from "../../chat-core/messages";

/**
 * 模型下拉菜单项（antd Dropdown 时代的结构子集；ChatInputArea 换 @tau/ui Menu 后收敛为原语协议）。
 * ext / desktop 侧构造的字段不超出此面，antd message 等 UI 库类型不得回流 shared 类型层。
 */
export interface ChatDropdownItem {
  key: string;
  label: ReactNode;
  /** 分组小标题（非交互项，如模型菜单的 provider 名） */
  group?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}

/** 消息内容类型；resourceId 仅兼容历史数据，新附件只写入路径。 */
export type MessageContentItem = MessageContent;

/** ChatInputArea 需要的服务函数 */
export interface ChatInputAreaServices {
  /** 上传文件，返回文件路径 */
  uploadFile: (file: File) => Promise<string | null>;
  /** 将本地文件路径转换为可访问的 URL */
  convertFileSrc: (path: string) => Promise<string>;
  /** 获取用户主目录 */
  getHomeDir: () => Promise<string>;
  /** 搜索可提及的内部内容 */
  searchMentionRefs?: (query: string) => Promise<MentionRef[]>;
}

/** ChatInputArea 的 ref handle */
export interface ChatInputAreaHandle {
  getValue: () => MessageContentItem[];
  clear: () => void;
  setValue: (content: string) => void;
  appendMention?: (mention: MentionRef) => void;
  focusEnd: () => void;
}

export interface ChatContextUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** ChatInputArea 的 props */
export interface ChatInputAreaProps {
  /** 服务函数 */
  services: ChatInputAreaServices;
  /** 自定义类名 */
  className?: string;
  /** 是否可编辑 */
  contentEditable?: boolean;
  /** 按下回车时的回调 */
  onPressEnter?: () => void;
  /** 停止生成时的回调 */
  onStop?: () => void;
  /** 占位符 */
  placeholder?: string;
  /** 是否正在发送 */
  sendLoading?: boolean;
  /** 生成期间是否仍允许编辑并将消息加入发送队列 */
  allowSendWhileLoading?: boolean;
  /** 当前等待发送的消息数量 */
  queuedMessageCount?: number;
  /** 是否正在创建新消息 */
  createMessageLoading?: boolean;
  /** 创建新消息的回调 */
  onCreateNewMessage?: () => void;
  /** 模型选择菜单项 */
  modelSelectItems?: ChatDropdownItem[];
  /** 当前选中模型的菜单项 key，用于菜单勾选 */
  currentModelKey?: string;
  /** 模型选择回调 */
  onModelSelect?: ({ key }: { key: string }) => void;
  /** 当前模型名称 */
  currentModelName?: string;
  /** 当前模型上下文窗口，单位为 k tokens */
  contextWindowK?: number;
  /** 当前聊天最近一次模型请求的 token 用量 */
  contextUsage?: ChatContextUsage | null;
  /** 是否支持图片上传 */
  isSupportImage?: boolean;
  /** 是否支持文件上传 */
  isSupportFile?: boolean;
  /** 思考档位 */
  thinkingLevel?: ThinkingLevel;
  /** 当前模型真实支持的档位（由模型能力决定，不是固定几档） */
  thinkingLevelOptions?: readonly ThinkingLevel[];
  /** 档位变化回调 */
  onThinkingLevelChange?: (level: ThinkingLevel) => void;
  /** 档位选择是否禁用 */
  thinkingLevelDisabled?: boolean;
  /** MCP 管理按钮点击回调（可选，不提供则不显示按钮） */
  onMcpManagerClick?: () => void;
  /** 额外的工具栏按钮（渲染在 ＋ 右侧） */
  extraToolbarButtons?: ReactNode;
}
