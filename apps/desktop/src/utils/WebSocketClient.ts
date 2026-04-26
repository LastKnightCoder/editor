import { isRpcNotificationMessage, isRpcResponseMessage } from "./rpc";
import { v4 as uuidv4 } from "uuid";
import { RpcMessageType } from "@/types";

type NotificationHandler = (data: unknown) => void;
export type WebSocketConnectionState =
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed";

type ConnectionStateHandler = (state: WebSocketConnectionState) => void;

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
      const newHandlers = handlers.filter((h) => h !== handler);
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
      this.connectionState === "reconnecting" ? "reconnecting" : "connecting",
    );
    this.ws.addEventListener("message", this.onMessage.bind(this));
    this.ws.addEventListener("open", this.onOpen.bind(this));
    this.ws.addEventListener("close", this.onClose.bind(this));
    this.ws.addEventListener("error", this.onError.bind(this));
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
      const unsubscribe = this.onConnectionStateChange((state) => {
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

  async sendRequest(method: string, params: unknown, timeout = 60000) {
    const startedAt = Date.now();
    await this.waitForOpen(timeout);

    const elapsedMs = Date.now() - startedAt;
    const remainingTimeout =
      timeout > 0 ? Math.max(0, timeout - elapsedMs) : timeout;

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
    console.log("WebSocketClient onOpen");
  }

  onClose() {
    this.rejectPendingRequests(new Error("WebSocket connection closed"));
    console.log("WebSocketClient onClose");
    if (this.manualClose) {
      this.setConnectionState("closed");
      return;
    }

    this.setConnectionState("reconnecting");
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, this.reconnectDelayMs);
    }
  }

  onError(event: Event) {
    console.error("WebSocketClient onError", event);
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
