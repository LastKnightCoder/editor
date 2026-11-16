import {
  RpcMessageType,
  RpcHeartbeatMessage,
  RpcRequestMessage,
  RpcResponseMessage,
  RpcNotificationMessage,
} from "@/types";

export function isPingMessage(message: unknown): message is RpcHeartbeatMessage {
  return (
    !!message &&
    Object.prototype.hasOwnProperty.call(message, "type") &&
    (message as Record<string, unknown>).type === RpcMessageType.Ping
  );
}
export function isPongMessage(message: unknown): message is RpcHeartbeatMessage {
  return (
    !!message &&
    Object.prototype.hasOwnProperty.call(message, "type") &&
    (message as Record<string, unknown>).type === RpcMessageType.Pong
  );
}
export function isRpcRequestMessage(message: unknown): message is RpcRequestMessage {
  return (
    !!message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === RpcMessageType.Request
  );
}
export function isRpcResponseMessage(message: unknown): message is RpcResponseMessage {
  return (
    !!message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === RpcMessageType.Response
  );
}

export function isRpcNotificationMessage(message: unknown): message is RpcNotificationMessage {
  return (
    !!message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === RpcMessageType.Notification
  );
}
