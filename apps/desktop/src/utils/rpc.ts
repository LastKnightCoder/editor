import {
  RpcMessageType,
  RpcHeartbeatMessage,
  RpcRequestMessage,
  RpcResponseMessage,
  RpcNotificationMessage,
} from "@/types";

export function isRpcHeartbeatMessage(
  message: any,
): message is RpcHeartbeatMessage {
  return (
    message &&
    typeof message === "object" &&
    "type" in message &&
    (message.type === RpcMessageType.Ping ||
      message.type === RpcMessageType.Pong)
  );
}
export function isPingMessage(message: any): message is RpcHeartbeatMessage {
  return (
    message &&
    Object.prototype.hasOwnProperty.call(message, "type") &&
    message.type === RpcMessageType.Ping
  );
}
export function isPongMessage(message: any): message is RpcHeartbeatMessage {
  return (
    message &&
    Object.prototype.hasOwnProperty.call(message, "type") &&
    message.type === RpcMessageType.Pong
  );
}
export function isRpcRequestMessage(
  message: any,
): message is RpcRequestMessage {
  return (
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === RpcMessageType.Request
  );
}
export function isRpcResponseMessage(
  message: any,
): message is RpcResponseMessage {
  return (
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === RpcMessageType.Response
  );
}

export function isRpcNotificationMessage(
  message: any,
): message is RpcNotificationMessage {
  return (
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === RpcMessageType.Notification
  );
}
