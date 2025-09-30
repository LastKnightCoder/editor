import { isRpcNotificationMessage, isRpcResponseMessage } from "./rpc";
import { v4 as uuidv4 } from "uuid";
import { RpcMessageType } from "@/types";

type NotificationHandler = (data: unknown) => void;
interface Request {
  resolve: (value: unknown | PromiseLike<unknown>) => void;
  reject: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
}

class WebSocketClient {
  private ws: WebSocket | null = null;
  private notificationHandler: Record<string, NotificationHandler[]> = {};
  private pendingRequest: Map<string, Request> = new Map();
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.addEventListener("message", this.onMessage.bind(this));
    this.ws.addEventListener("open", this.onOpen.bind(this));
    this.ws.addEventListener("close", this.onClose.bind(this));
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

  sendRequest(method: string, params: unknown, timeout = 60000) {
    return new Promise<unknown>((resolve, reject) => {
      if (!this.ws) {
        throw new Error("WebSocket is not connected");
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (timeout > 0) {
        timer = setTimeout(() => {
          reject();
        }, timeout);
      }
      const request = {
        resolve,
        reject,
        timer,
      } satisfies Request;

      const message = {
        id: uuidv4(),
        method,
        params,
        jsonrpc: "2.0",
        type: RpcMessageType.Request,
        private: null,
      };

      this.pendingRequest.set(message.id, request);
      this.ws.send(JSON.stringify(message));
    });
  }

  onOpen() {
    console.log("WebSocketClient onOpen");
  }

  onClose() {
    console.log("WebSocketClient onClose");
  }
}

export default WebSocketClient;
