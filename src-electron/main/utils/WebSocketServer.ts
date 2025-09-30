import NodeWebSocket from "ws";
import { ClientRequestArgs } from "http";
import {
  RpcNotificationMessage,
  RpcRequestMessage,
  RpcResponseMessage,
} from "@/types";

export interface ClientOptions<
  M extends object,
  T extends WebSocketType = NodeWebSocket,
> {
  protocols?: string | string[];
  requestArgs?: ClientRequestArgs;
  ping?: boolean; // default is true
  pingInterval?: number; // default is 30s
  onMessage?: (ws: T, message: M) => void;
  onOpen?: (ws: T) => void;
  onClose?: (ws: T, code: number, reason: string) => void;
  onError?: (ws: T, error: Error) => void;
}

export type WebSocketType = WebSocket | NodeWebSocket;

class WebSocketClient<
  M extends object,
  W extends WebSocketType = NodeWebSocket,
> {
  client: W | null = null;
  protected url: string;
  protected options: ClientOptions<M, W>;
  protected lastCreatedConnectionTimestamp: number | null = null;
  protected heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(url: string, options?: ClientOptions<M, W>) {
    if (!url) {
      throw new Error("url and messageHandler are required");
    }

    this.url = url;
    this.options = Object.assign({ ping: true, pingInterval: 30e3 }, options);
    this.createConnection();
  }

  protected onOpen(ws: W) {
    try {
      this.options?.onOpen?.(ws);
    } catch (err) {
      console.error("WebSocketClient onOpen error:", err);
    }
  }

  protected onMessage(ws: W, message: M) {
    try {
      this.options?.onMessage?.(ws, message);
    } catch (err) {
      console.error("WebSocketClient onMessage error:", err);
    }
  }

  protected onClose(ws: W, code: number, reason: string) {
    try {
      this.options?.onClose?.(ws, code, reason.toString());
    } catch (err) {
      console.error("WebSocketClient onClose error:", err);
    }
  }

  protected onError(ws: W, error: Error) {
    try {
      this.options?.onError?.(ws, error);
    } catch (err) {
      console.error("WebSocketClient onError error:", err);
    }
  }

  protected createConnection() {
    const ws = new NodeWebSocket(
      this.url,
      this.options?.protocols,
      this.options?.requestArgs,
    );
    this.lastCreatedConnectionTimestamp = Date.now();
    this.heartbeat();

    ws.on("open", () => {
      this.onOpen(ws as W);
    });

    ws.on("message", (message) => {
      try {
        const msg = JSON.parse(message.toString());

        if (!msg || typeof msg !== "object") {
          throw new Error("Invalid message format: not an object");
        }

        if (msg.type === "pong") {
          // console.log('pong received')
        } else {
          this.onMessage(ws as W, msg as M);
        }
      } catch (err) {
        console.error("JSON parse error:", err);
        this.onError(
          ws as W,
          new Error(`Message parsing error: ${(err as Error).message}`),
        );
      }
    });

    ws.on("close", (code, reason) => {
      if (code !== 1000) {
        this.reconnect();
      } else {
        this.stopHeartbeat();
      }
      this.onClose(ws as W, code, reason.toString());
    });

    ws.on("error", (error) => {
      console.error(`${this.url} error:`, error);
      this.reconnect();
      this.onError(ws as W, error);
    });

    this.client = ws as W;
  }

  isConnected() {
    const OPEN_STATE = 1;
    return this.client && this.client.readyState === OPEN_STATE;
  }

  sendMessage(message: string) {
    if (!this.client) return;
    if (this.isConnected()) {
      this.client.send(message);
      return true;
    } else {
      return false;
    }
  }

  sendJsonMessage(
    messageObj: RpcRequestMessage | RpcResponseMessage | RpcNotificationMessage,
  ) {
    if (!this.client) return;
    if (this.isConnected()) {
      try {
        const message = JSON.stringify(messageObj);
        this.client.send(message);
        return true;
      } catch (error) {
        console.error("Failed to serialize JSON message:", error);
        return false;
      }
    } else {
      console.error(
        "WebSocket is not open. ReadyState:",
        this.client.readyState,
      );
      return false;
    }
  }

  protected heartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (!this.client) return;
      if (!this.isConnected()) {
        this.reconnect();
      } else {
        this.options?.ping &&
          this.client.send(JSON.stringify({ type: "ping" }));
      }
    }, this.options.pingInterval);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
  }

  protected reconnect() {
    if (this.lastCreatedConnectionTimestamp) {
      const interval = Date.now() - this.lastCreatedConnectionTimestamp;
      if (interval < 10e3) {
        console.log(`do not reconnect for a short period of time: ${interval}`);
        return;
      }
    }

    if (this.isConnected()) {
      this.close();
    }

    this.stopHeartbeat();
    this.createConnection();
  }

  close(code?: number) {
    if (code === 1000) {
      this.stopHeartbeat();
    }

    if (!this.client) return;
    this.client.close(code ?? 1000);
  }
}

export default WebSocketClient;
