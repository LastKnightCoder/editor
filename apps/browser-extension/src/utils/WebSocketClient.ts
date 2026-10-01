import { v4 as uuidv4 } from "uuid";
import { isRpcNotificationMessage, isRpcResponseMessage } from "./rpc";
import { RpcMessageType, type RpcNotificationMessage } from "./types";
import type { WebSocketLike } from "./wsRelay";

type NotificationHandler = (data: unknown) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
}

export type ConnectionEventHandler = () => void;

/** 默认直连；content script 需传入经后台转发的连接（见 wsRelay） */
export type WebSocketFactory = (url: string) => WebSocketLike;

const directWebSocket: WebSocketFactory = url => new WebSocket(url);

/**
 * WebSocket 客户端，复用桌面端 RPC 协议
 * 增加了连接状态回调和自动重连能力
 */
class WebSocketClient {
  private ws: WebSocketLike | null = null;
  private notificationHandlers: Record<string, NotificationHandler[]> = {};
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private url: string;
  private createSocket: WebSocketFactory;

  private _onOpen: ConnectionEventHandler | null = null;
  private _onClose: ConnectionEventHandler | null = null;

  constructor(url: string, createSocket: WebSocketFactory = directWebSocket) {
    this.url = url;
    this.createSocket = createSocket;
  }

  /** 设置连接成功的回调 */
  set onOpenHandler(handler: ConnectionEventHandler | null) {
    this._onOpen = handler;
  }

  /** 设置连接关闭的回调 */
  set onCloseHandler(handler: ConnectionEventHandler | null) {
    this._onClose = handler;
  }

  /** 建立连接 */
  connect() {
    try {
      this.ws = this.createSocket(this.url);
      this.ws.addEventListener("message", this.handleMessage.bind(this));
      this.ws.addEventListener("open", this.handleOpen.bind(this));
      this.ws.addEventListener("close", this.handleClose.bind(this));
      this.ws.addEventListener("error", this.handleError.bind(this));
    } catch {
      this._onClose?.();
    }
  }

  /** 断开连接 */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /** 当前是否已连接 */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
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
      this.notificationHandlers[method] = handlers.filter(h => h !== handler);
    }
  }

  sendNotification<T = unknown>(method: string, data: T) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket 未连接");
    }

    const notification: RpcNotificationMessage<T> = {
      type: RpcMessageType.Notification,
      method,
      data,
    };
    this.ws.send(JSON.stringify(notification));
  }

  /** 发送 RPC 请求并等待响应 */
  sendRequest(method: string, params: unknown, timeout = 60000) {
    return new Promise<unknown>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket 未连接"));
        return;
      }

      let timer: ReturnType<typeof setTimeout> | undefined;
      if (timeout > 0) {
        timer = setTimeout(() => {
          reject(new Error(`请求超时: ${method}`));
        }, timeout);
      }

      const request: PendingRequest = { resolve, reject, timer };
      const message = {
        id: uuidv4(),
        method,
        params,
        type: RpcMessageType.Request,
      };

      this.pendingRequests.set(message.id, request);
      this.ws.send(JSON.stringify(message));
    });
  }

  private handleMessage(event: MessageEvent) {
    let message: unknown;
    try {
      message = JSON.parse(event.data);
    } catch {
      console.error("[Tau Extension] 解析消息失败");
      return;
    }

    if (isRpcNotificationMessage(message)) {
      const { method, data } = message;
      const handlers = this.notificationHandlers[method];
      if (Array.isArray(handlers)) {
        for (const handler of handlers) {
          try {
            handler(data);
          } catch (e) {
            console.error("[Tau Extension] 通知处理错误:", e);
          }
        }
      }
    } else if (isRpcResponseMessage(message)) {
      const { id, result, error } = message;
      const request = this.pendingRequests.get(id);
      if (request) {
        const { resolve, reject, timer } = request;
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
        if (timer) clearTimeout(timer);
        this.pendingRequests.delete(id);
      }
    }
  }

  private handleOpen() {
    console.log("[Tau Extension] WebSocket 已连接");
    this._onOpen?.();
  }

  private handleClose() {
    console.log("[Tau Extension] WebSocket 已断开");
    this.ws = null;
    // 拒绝所有待处理的请求
    for (const [id, request] of this.pendingRequests) {
      if (request.timer) clearTimeout(request.timer);
      request.reject(new Error("连接已断开"));
      this.pendingRequests.delete(id);
    }
    this._onClose?.();
  }

  private handleError() {
    console.error("[Tau Extension] WebSocket 连接错误");
  }
}

export default WebSocketClient;
