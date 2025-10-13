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
