import { isRpcNotificationMessage, isRpcResponseMessage } from "./rpc";
import { v4 as uuidv4 } from "uuid";
import { RpcMessageType } from "@/types";
import { logThrottled } from "@/utils/throttled-log";

type NotificationHandler = (data: unknown) => void;
export type WebSocketConnectionState = "connecting" | "open" | "reconnecting" | "closed";

type ConnectionStateHandler = (state: WebSocketConnectionState) => void;

// 启动期渲染端常先于后端服务就绪，头几次重连是正常竞态；持续失败才值得告警
const RECONNECT_WARN_AFTER = 10;
const RECONNECT_LOG_INTERVAL_MS = 30_000;

interface Request {
  resolve: (value: unknown | PromiseLike<unknown>) => void;
  reject: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
}

class WebSocketClient {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private notificationHandler: Record<string, NotificationHandler[]> = {};
  private pendingRequest: Map<string, Request> = new Map();
  private connectionState: WebSocketConnectionState = "connecting";
  private connectionStateHandlers = new Set<ConnectionStateHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualClose = false;
  private reconnectDelayMs = 1000;
  private reconnectAttempts = 0;
  private reconnectLoggedAt = 0;

  constructor(url: string) {
    this.url = url;
    this.connect();
  }

  registerNotificationHandler(method: string, handler: NotificationHandler) {
    if (!this.notificationHandler[method]) {
      this.notificationHandler[method] = [];
    }
    const notificationHandlers = this.notificationHandler[method];
    notificationHandlers.push(handler);
  }

  unregisterNotificationHandler(method: string, handler: NotificationHandler) {
    const handlers = this.notificationHandler[method];
    if (Array.isArray(handlers)) {
      const newHandlers = handlers.filter(h => h !== handler);
      this.notificationHandler[method] = newHandlers;
    }
  }

  onConnectionStateChange(handler: ConnectionStateHandler) {
    this.connectionStateHandlers.add(handler);
    handler(this.connectionState);
    return () => {
      this.connectionStateHandlers.delete(handler);
    };
  }

  private setConnectionState(state: WebSocketConnectionState) {
    this.connectionState = state;
    for (const handler of this.connectionStateHandlers) {
      try {
        handler(state);
      } catch (error) {
        console.error(error);
      }
    }
  }

  private connect() {
    this.ws = new WebSocket(this.url);
    this.setConnectionState(
      this.connectionState === "reconnecting" ? "reconnecting" : "connecting"
    );
    this.ws.addEventListener("message", this.onMessage.bind(this));
    this.ws.addEventListener("open", this.onOpen.bind(this));
    this.ws.addEventListener("close", this.onClose.bind(this));
  }

  private onMessage(event: MessageEvent) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (e) {
      console.error("parse message error", e);
    }
    if (isRpcNotificationMessage(message)) {
      const { method, data } = message;
      const notificationHandlers = this.notificationHandler[method];
      if (Array.isArray(notificationHandlers)) {
        for (const handler of notificationHandlers) {
          try {
            handler(data);
          } catch (e) {
            console.error(e);
          }
        }
      }
    } else if (isRpcResponseMessage(message)) {
      const { id, result, error } = message;
      const request = this.pendingRequest.get(id);
      if (request) {
        const { resolve, reject, timer } = request;
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
        if (timer) {
          clearTimeout(timer);
        }
        this.pendingRequest.delete(id);
      }
    }
  }

  private waitForOpen(timeout = 60000) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const unsubscribe = this.onConnectionStateChange(state => {
        if (state === "open") {
          if (timer) {
            clearTimeout(timer);
          }
          unsubscribe();
          resolve();
        }
      });

      if (timeout > 0) {
        timer = setTimeout(() => {
          unsubscribe();
          reject(new Error("WebSocket connection timeout"));
        }, timeout);
      }
    });
  }

  /**
   * 传输层失败（未连接、等待超时、连接断开）只到这里才知道，调用方多半只弹提示，
   * 因此在这里统一留痕；服务端返回的业务错误是普通对象，由服务端落日志。
   */
  sendRequest(method: string, params: unknown, timeout = 60000): Promise<unknown> {
    return this.request(method, params, timeout).catch((error: unknown) => {
      if (error instanceof Error)
        logThrottled(`backend-ws:${method}`, "warn", "[backend-ws] 请求失败", {
          method,
          state: this.connectionState,
          error: error.message,
        });
      throw error;
    });
  }

  private async request(method: string, params: unknown, timeout = 60000) {
    const startedAt = Date.now();
    await this.waitForOpen(timeout);

    const elapsedMs = Date.now() - startedAt;
    const remainingTimeout = timeout > 0 ? Math.max(0, timeout - elapsedMs) : timeout;

    return new Promise<unknown>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket is not connected"));
        return;
      }

      const message = {
        id: uuidv4(),
        method,
        params,
        type: RpcMessageType.Request,
      };

      let timer: ReturnType<typeof setTimeout> | undefined;
      if (remainingTimeout > 0) {
        timer = setTimeout(() => {
          this.pendingRequest.delete(message.id);
          reject(new Error(`Request timeout: ${method}`));
        }, remainingTimeout);
      }

      const request = {
        resolve,
        reject,
        timer,
      } satisfies Request;

      this.pendingRequest.set(message.id, request);
      this.ws.send(JSON.stringify(message));
    });
  }

  private rejectPendingRequests(error: Error) {
    for (const [id, request] of this.pendingRequest.entries()) {
      if (request.timer) {
        clearTimeout(request.timer);
      }
      request.reject(error);
      this.pendingRequest.delete(id);
    }
  }

  onOpen() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.setConnectionState("open");
    console.info("[backend-ws] 已连接", { attempts: this.reconnectAttempts });
    this.reconnectAttempts = 0;
  }

  onClose(event: CloseEvent) {
    this.rejectPendingRequests(new Error("WebSocket connection closed"));
    if (this.manualClose) {
      this.setConnectionState("closed");
      return;
    }

    this.reconnectAttempts += 1;
    const now = Date.now();
    const early = this.reconnectAttempts < RECONNECT_WARN_AFTER;
    if (early || now - this.reconnectLoggedAt >= RECONNECT_LOG_INTERVAL_MS) {
      this.reconnectLoggedAt = now;
      console[early ? "info" : "warn"]("[backend-ws] 连接断开，准备重连", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        attempts: this.reconnectAttempts,
      });
    }
    this.setConnectionState("reconnecting");
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, this.reconnectDelayMs);
    }
  }

  close() {
    this.manualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.setConnectionState("closed");
  }
}

export default WebSocketClient;
