import {
  RpcMessageType,
  type RpcHeartbeatMessage,
  type RpcRequestMessage,
  type RpcResponseMessage,
  type RpcNotificationMessage,
} from "./types";

export function isRpcHeartbeatMessage(
  message: unknown,
): message is RpcHeartbeatMessage {
  return (
    message != null &&
    typeof message === "object" &&
    "type" in message &&
    ((message as RpcHeartbeatMessage).type === RpcMessageType.Ping ||
      (message as RpcHeartbeatMessage).type === RpcMessageType.Pong)
  );
}

export function isRpcRequestMessage(
  message: unknown,
): message is RpcRequestMessage {
  return (
    message != null &&
    typeof message === "object" &&
    "type" in message &&
    (message as RpcRequestMessage).type === RpcMessageType.Request
  );
}

export function isRpcResponseMessage(
  message: unknown,
): message is RpcResponseMessage {
  return (
    message != null &&
    typeof message === "object" &&
    "type" in message &&
    (message as RpcResponseMessage).type === RpcMessageType.Response
  );
}

export function isRpcNotificationMessage(
  message: unknown,
): message is RpcNotificationMessage {
  return (
    message != null &&
    typeof message === "object" &&
    "type" in message &&
    (message as RpcNotificationMessage).type === RpcMessageType.Notification
  );
}
