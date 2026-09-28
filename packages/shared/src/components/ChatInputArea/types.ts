import type { ReactNode } from "react";
import type { MenuProps } from "antd";

/**
 * 思考档位——全仓唯一定义，取值与运行时（pi ThinkingLevel）逐项对齐。
 * 桌面端 `PiThinkingLevel` 即本类型；此前两侧各有一套（旧枚举用 "none" 且没有 "minimal"），
 * 导致 minimal 在界面上不可达、每处转换都要记得 none→off。
 */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export type MentionEntityType = "card" | "article" | "project-item";

/** 聊天 mention 引用 */
export interface MentionRef {
  entityType: MentionEntityType;
  entityId: number;
  contentId: number;
  title: string;
  previewText: string;
}

/** 消息内容类型；resourceId 仅兼容历史数据，新附件只写入路径。 */
export type MessageContentItem =
  | { type: "text"; text: string; mentions?: MentionRef[]; skills?: string[] }
  | { type: "image"; image: string; path?: string; resourceId?: number }
  | { type: "file"; file: string; resourceId?: number; fileName?: string };

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
  modelSelectItems?: MenuProps["items"];
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
  /** 额外的工具栏按钮（渲染在左侧工具栏末尾） */
  extraToolbarButtons?: ReactNode;
}
