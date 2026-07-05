import type { ReactNode } from "react";
import type { MenuProps } from "antd";

/** 推理强度 */
export type ReasoningEffort = "none" | "low" | "medium" | "high";

export type MentionEntityType =
  | "card"
  | "article"
  | "project-item"
  | "document-item";

/** 聊天 mention 引用 */
export interface MentionRef {
  entityType: MentionEntityType;
  entityId: number;
  contentId: number;
  title: string;
  previewText: string;
}

/** 消息内容类型 */
export type MessageContentItem =
  | { type: "text"; text: string; mentions?: MentionRef[] }
  | { type: "image"; image: string; path?: string; resourceId?: number }
  | { type: "file"; file: string; resourceId?: number; fileName?: string };

/** 资源来源 */
export interface IResourceSource {
  type: "content" | "whiteboard" | "podcast" | "chat" | "ebook";
  id: number;
}

/** 资源 */
export interface IResource {
  id: number;
  name: string;
  path: string;
  type?: string;
}

/** 创建资源的参数 */
export interface CreateResourceParams {
  name: string;
  path: string;
  type: string;
  source?: IResourceSource;
}

/** ChatInputArea 需要的服务函数 */
export interface ChatInputAreaServices {
  /** 上传文件，返回文件路径 */
  uploadFile: (file: File) => Promise<string | null>;
  /** 将本地文件路径转换为可访问的 URL */
  convertFileSrc: (path: string) => Promise<string>;
  /** 获取用户主目录 */
  getHomeDir: () => Promise<string>;
  /** 创建或更新资源记录 */
  createOrUpdateResource: (params: CreateResourceParams) => Promise<IResource>;
  /** 搜索可提及的内部内容 */
  searchMentionRefs?: (query: string) => Promise<MentionRef[]>;
  /** 增加资源引用计数 */
  incrementResourceRef?: (
    path: string,
    source?: IResourceSource,
  ) => Promise<void>;
  /** 减少资源引用计数 */
  decrementResourceRef?: (path: string) => Promise<void>;
}

/** ChatInputArea 的 ref handle */
export interface ChatInputAreaHandle {
  getValue: () => MessageContentItem[];
  clear: (options?: { releaseResources?: boolean }) => void;
  setValue: (content: string) => void;
  focusEnd: () => void;
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
  /** 是否支持图片上传 */
  isSupportImage?: boolean;
  /** 是否支持文件上传 */
  isSupportFile?: boolean;
  /** 资源来源 */
  resourceSource?: IResourceSource | null;
  /** 推理强度 */
  reasoningEffort?: ReasoningEffort;
  /** 推理强度变化回调 */
  onReasoningEffortChange?: (level: ReasoningEffort) => void;
  /** 推理强度是否禁用 */
  reasoningEffortDisabled?: boolean;
  /** MCP 管理按钮点击回调（可选，不提供则不显示按钮） */
  onMcpManagerClick?: () => void;
  /** 额外的工具栏按钮（渲染在左侧工具栏末尾） */
  extraToolbarButtons?: ReactNode;
}
