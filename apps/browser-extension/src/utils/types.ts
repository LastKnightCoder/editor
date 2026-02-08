/** RPC 消息类型枚举，与桌面端保持一致 */
export enum RpcMessageType {
  Request = "JsonRpcRequest",
  Response = "JsonRpcResponse",
  Notification = "JsonRpcNotification",
  Ping = "ping",
  Pong = "pong",
}

export interface RpcRequestMessage<P extends Array<unknown> | null = null> {
  id: string;
  type: RpcMessageType.Request;
  method: string;
  params: P;
}

export type RpcResponseMessage<R = unknown, D = unknown> = {
  id: string;
  type: RpcMessageType.Response;
  method: string;
  result: R | null;
  error: RpcErrorResponse<D> | null;
};

export interface RpcHeartbeatMessage {
  type: RpcMessageType.Ping | RpcMessageType.Pong;
}

export interface RpcErrorResponse<D = unknown> {
  code: number;
  message: string;
  data?: D;
}

export interface RpcNotificationMessage<D = unknown> {
  type: RpcMessageType.Notification;
  method: string;
  data: D;
}

export type RpcMessage =
  | RpcRequestMessage
  | RpcResponseMessage
  | RpcNotificationMessage;

/** 主题模式（sidePanel 下无法访问宿主页面 DOM，去掉 auto） */
export type ThemeMode = "system" | "light" | "dark";

/** 解析后的实际主题 */
export type ResolvedTheme = "light" | "dark";

/** WebSocket 连接状态 */
export type ConnectionStatus = "connecting" | "connected" | "disconnected";

/** Tab 类型 */
export type TabType = "overview" | "chat" | "notes";

/** 导航页面类型 */
export type PageType = "main" | "settings" | "allNotes";

/** 笔记元数据 */
export interface NoteMetadata {
  id: string; // uuid
  title: string; // 自动生成如 "笔记 1"，可编辑
  createdAt: number;
  updatedAt: number;
  /** 数据库名称 -> contentId 的映射，contentId 仅在对应数据库下有效 */
  contentIdMap?: Record<string, number>;
}
