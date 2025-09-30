export enum RpcMessageType {
  Request = "JsonRpcRequest",
  Response = "JsonRpcResponse",
  Notification = "JsonRpcNotification",
  Ping = "ping",
  Pong = "pong",
}

export interface RpcRequestMessage<P extends Array<unknown> | null = null> {
  jsonrpc: "2.0";
  id: string;
  type: RpcMessageType.Request;
  method: string;
  params: P;
  // 遗留问题，结构体中必须先带上这个 key
  private: null;
  send_timestamp?: number;
}

export type RpcResponseMessage<R = unknown, D = unknown> = {
  jsonrpc: "2.0";
  id: string;
  type: RpcMessageType.Response;
  method: string;
  result: R | null;
  error: RpcErrorResponse<D> | null;
  private: null;
};

export interface RpcHeartbeatMessage {
  // jsonrpc?: '2.0'
  // id?: RpcMessageId
  type: RpcMessageType.Ping | RpcMessageType.Pong;
}

export interface RpcErrorResponse<D = unknown> {
  code: number;
  message: string;
  data?: D;
}

export interface RpcNotificationMessage<D = unknown> {
  jsonrpc: "2.0";
  type: RpcMessageType.Notification;
  method: string;
  data: D;
}

export type RpcMessage =
  | RpcRequestMessage
  | RpcResponseMessage
  | RpcNotificationMessage;
