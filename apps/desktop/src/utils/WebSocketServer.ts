import {
  isRpcRequestMessage,
  isRpcNotificationMessage,
  isPingMessage,
} from "./rpc";
import { v4 as uuidv4 } from "uuid";
import {
  RpcMessageType,
  RpcRequestMessage,
  RpcResponseMessage,
  RpcNotificationMessage,
} from "@/types";

const WS_PORT = 24678;

type RequestHandler = (
  request: RpcRequestMessage,
) => Promise<unknown> | unknown;

type NotificationHandler = (data: unknown) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
}

class WebSocketServer {
  private ws: WebSocket | null = null;
  private requestHandlers: Map<string, RequestHandler> = new Map();
  private notificationHandlers: Record<string, NotificationHandler[]> = {};
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private path: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnected = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(path: string) {
    this.path = path;
    this.connect();
  }

  private connect() {
    const url = `ws://localhost:${WS_PORT}/${this.path}?isServer=true`;
    console.log(`[WebSocketServer] 连接到 ${url}`);

    try {
      this.ws = new WebSocket(url);
      this.ws.addEventListener("open", this.onOpen.bind(this));
      this.ws.addEventListener("message", this.onMessage.bind(this));
      this.ws.addEventListener("close", this.onClose.bind(this));
      this.ws.addEventListener("error", this.onError.bind(this));
    } catch (error) {
      console.error("[WebSocketServer] 连接失败:", error);
      this.scheduleReconnect();
    }
  }

  private onOpen() {
    console.log(`[WebSocketServer] 已连接到 /${this.path}`);
    this.isConnected = true;
    this.startHeartbeat();
  }

  private onMessage(event: MessageEvent) {
    let message: unknown;
    try {
      message = JSON.parse(event.data);
    } catch (e) {
      console.error("[WebSocketServer] 解析消息失败:", e);
      return;
    }

    // 处理心跳
    if (isPingMessage(message)) {
      this.ws?.send(JSON.stringify({ type: RpcMessageType.Pong }));
      return;
    }

    // 处理请求（来自客户端）
    if (isRpcRequestMessage(message)) {
      this.handleRequest(message);
      return;
    }

    // 处理通知（来自其他服务端或系统）
    if (isRpcNotificationMessage(message)) {
      const { method, data } = message;
      const handlers = this.notificationHandlers[method];
      if (Array.isArray(handlers)) {
        for (const handler of handlers) {
          try {
            handler(data);
          } catch (e) {
            console.error("[WebSocketServer] 通知处理错误:", e);
          }
        }
      }
      return;
    }

    // 处理响应（当此服务端作为客户端发送请求时）
    if (
      message &&
      typeof message === "object" &&
      "type" in message &&
      (message as { type: string }).type === RpcMessageType.Response
    ) {
      const response = message as RpcResponseMessage;
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        if (pending.timer) clearTimeout(pending.timer);
        if (response.error) {
          pending.reject(response.error);
        } else {
          pending.resolve(response.result);
        }
        this.pendingRequests.delete(response.id);
      }
    }
  }

  private async handleRequest(request: RpcRequestMessage) {
    const { id, method } = request;
    const handler = this.requestHandlers.get(method);

    let result: unknown = null;
    let error: { code: number; message: string } | null = null;

    if (handler) {
      try {
        result = await Promise.resolve(handler(request));
      } catch (e) {
        console.error(`[WebSocketServer] 处理 ${method} 失败:`, e);
        error = {
          code: 1,
          message: e instanceof Error ? e.message : String(e),
        };
      }
    } else {
      error = {
        code: -32601,
        message: `方法不存在: ${method}`,
      };
    }

    // 发送响应
    const response: RpcResponseMessage = {
      id,
      type: RpcMessageType.Response,
      method,
      result,
      error,
    };
    this.ws?.send(JSON.stringify(response));
  }

  private onClose(event: CloseEvent) {
    console.log(
      `[WebSocketServer] 连接关闭: code=${event.code}, reason=${event.reason}`,
    );
    this.isConnected = false;
    this.stopHeartbeat();
    this.scheduleReconnect();
  }

  private onError(event: Event) {
    console.error("[WebSocketServer] 连接错误:", event);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    console.log("[WebSocketServer] 5秒后重连...");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: RpcMessageType.Ping }));
      }
    }, 30000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  addRequestHandler(method: string, handler: RequestHandler) {
    if (this.requestHandlers.has(method)) {
      console.warn(`[WebSocketServer] 方法 ${method} 已存在，将被覆盖`);
    }
    this.requestHandlers.set(method, handler);
  }

  removeRequestHandler(method: string) {
    this.requestHandlers.delete(method);
  }

  registerNotificationHandler(method: string, handler: NotificationHandler) {
    if (!this.notificationHandlers[method]) {
      this.notificationHandlers[method] = [];
    }
    this.notificationHandlers[method].push(handler);
  }

  unregisterNotificationHandler(method: string, handler: NotificationHandler) {
    const handlers = this.notificationHandlers[method];
    if (Array.isArray(handlers)) {
      this.notificationHandlers[method] = handlers.filter((h) => h !== handler);
    }
  }

  sendNotification<T = unknown>(method: string, data: T) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[WebSocketServer] WebSocket 未连接，无法发送通知");
      return;
    }
    const notification: RpcNotificationMessage<T> = {
      type: RpcMessageType.Notification,
      method,
      data,
    };
    this.ws.send(JSON.stringify(notification));
  }

  sendRequest<T = unknown>(
    method: string,
    params: unknown,
    timeout = 60000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket 未连接"));
        return;
      }

      const id = uuidv4();
      let timer: ReturnType<typeof setTimeout> | undefined;

      if (timeout > 0) {
        timer = setTimeout(() => {
          this.pendingRequests.delete(id);
          reject(new Error(`请求超时: ${method}`));
        }, timeout);
      }

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      const request: RpcRequestMessage = {
        id,
        type: RpcMessageType.Request,
        method,
        params: params as null,
      };
      this.ws.send(JSON.stringify(request));
    });
  }

  get connected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  close() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000);
      this.ws = null;
    }
  }
}

export default WebSocketServer;
