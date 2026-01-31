import {
  RpcNotificationMessage,
  RpcResponseMessage,
  RpcMessageType,
  RpcMessage,
} from "@/types/rpc";
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";

/** 进度通知数据 */
export interface ProgressData {
  requestId?: string;
  type?: string;
  percentage?: number;
  message?: string;
  [key: string]: unknown;
}

/** RPC 请求参数基础类型 */
export type RpcParams = Record<string, unknown>;

interface PendingRequest<T = unknown> {
  resolve: (result: T) => void;
  reject: (error: Error) => void;
  onProgress?: (data: ProgressData) => void;
  method: string;
}

interface PythonWebSocketClientOptions {
  onServerReady?: () => void;
  onServerGone?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Python WebSocket 客户端
 * 连接到 ServerModule，发送 RPC 请求到 Python 服务器
 */
class PythonWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private options: PythonWebSocketClientOptions;
  private pendingRequests: Map<string, PendingRequest<unknown>> = new Map();
  private notificationHandlers: Map<string, Set<(data: unknown) => void>> =
    new Map();
  private serverReady = false;
  private reconnecting = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastConnectTime = 0;

  constructor(port: number, options: PythonWebSocketClientOptions = {}) {
    this.url = `ws://localhost:${port}/python-server`;
    this.options = options;
  }

  /**
   * 连接到 WebSocket 服务器
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.lastConnectTime = Date.now();
        this.ws = new WebSocket(this.url);

        this.ws.on("open", () => {
          console.log("[PythonWebSocketClient] Connected to server");
          this.startHeartbeat();
          resolve();
        });

        this.ws.on("message", (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (e) {
            console.error(
              "[PythonWebSocketClient] Failed to parse message:",
              e,
            );
          }
        });

        this.ws.on("close", (code, reason) => {
          console.log(
            `[PythonWebSocketClient] Connection closed: ${code} ${reason}`,
          );
          this.stopHeartbeat();
          this.serverReady = false;

          if (code !== 1000 && !this.reconnecting) {
            this.reconnect();
          }
        });

        this.ws.on("error", (error) => {
          console.error("[PythonWebSocketClient] WebSocket error:", error);
          this.options.onError?.(error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 重连
   */
  private async reconnect() {
    if (this.reconnecting) return;

    const timeSinceLastConnect = Date.now() - this.lastConnectTime;
    if (timeSinceLastConnect < 5000) {
      console.log("[PythonWebSocketClient] Too soon to reconnect, waiting...");
      await new Promise((resolve) =>
        setTimeout(resolve, 5000 - timeSinceLastConnect),
      );
    }

    this.reconnecting = true;
    console.log("[PythonWebSocketClient] Attempting to reconnect...");

    try {
      await this.connect();
      this.reconnecting = false;
    } catch (e) {
      console.error("[PythonWebSocketClient] Reconnect failed:", e);
      this.reconnecting = false;
      // 等待后重试
      setTimeout(() => this.reconnect(), 5000);
    }
  }

  /**
   * 启动心跳
   */
  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.ws?.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * 检查 Python 服务器是否就绪
   */
  isServerReady(): boolean {
    return this.serverReady;
  }

  /**
   * 等待服务器就绪
   */
  async waitForServerReady(timeoutMs = 30000): Promise<void> {
    if (this.serverReady) return;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for Python server"));
      }, timeoutMs);

      const checkReady = () => {
        if (this.serverReady) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };

      checkReady();
    });
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(message: RpcMessage | { type: "pong" }) {
    if (message.type === "pong") {
      return;
    }

    if (message.type === RpcMessageType.Notification) {
      this.handleNotification(message as RpcNotificationMessage);
      return;
    }

    if (message.type === RpcMessageType.Response) {
      this.handleResponse(message as RpcResponseMessage);
      return;
    }
  }

  /**
   * 处理通知消息
   */
  private handleNotification(message: RpcNotificationMessage) {
    const { method, data } = message;

    // 处理服务器状态通知
    if (method === "server-ready") {
      console.log("[PythonWebSocketClient] Python server is ready");
      this.serverReady = true;
      this.options.onServerReady?.();
      return;
    }

    if (method === "server-gone") {
      console.log("[PythonWebSocketClient] Python server is gone");
      this.serverReady = false;
      this.options.onServerGone?.();
      return;
    }

    // 处理进度通知
    if (method.endsWith(":progress")) {
      const progressData = data as ProgressData;
      const requestId = progressData?.requestId;
      if (requestId) {
        const pending = this.pendingRequests.get(requestId);
        if (pending?.onProgress) {
          pending.onProgress(progressData);
        }
      }
      return;
    }

    // 调用注册的通知处理器
    const handlers = this.notificationHandlers.get(method);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  }

  /**
   * 处理响应消息
   */
  private handleResponse(message: RpcResponseMessage) {
    const { id, result, error } = message;

    const pending = this.pendingRequests.get(id);
    if (!pending) {
      console.warn(`[PythonWebSocketClient] No pending request for id: ${id}`);
      return;
    }

    this.pendingRequests.delete(id);

    if (error) {
      pending.reject(new Error(error.message || "Unknown error"));
    } else {
      pending.resolve(result);
    }
  }

  /**
   * 发送 RPC 请求
   */
  async request<T>(method: string, params: RpcParams = {}): Promise<T> {
    return this.requestWithProgress<T>(method, params);
  }

  /**
   * 发送带进度回调的 RPC 请求
   */
  async requestWithProgress<T>(
    method: string,
    params: RpcParams = {},
    onProgress?: (data: ProgressData) => void,
  ): Promise<T> {
    if (!this.isConnected()) {
      throw new Error("WebSocket is not connected");
    }

    if (!this.serverReady) {
      throw new Error("Python server is not ready");
    }

    const id = uuidv4();

    // 将 params 对象转换为数组格式以符合 RpcRequestMessage 的类型要求
    const requestMessage = {
      id,
      type: RpcMessageType.Request,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        onProgress,
        method,
      });

      this.ws?.send(JSON.stringify(requestMessage));
    });
  }

  /**
   * 注册通知处理器
   */
  onNotification(
    method: string,
    callback: (data: unknown) => void,
  ): () => void {
    if (!this.notificationHandlers.has(method)) {
      this.notificationHandlers.set(method, new Set());
    }

    const handlers = this.notificationHandlers.get(method);
    if (handlers) {
      handlers.add(callback);
    }

    // 返回取消订阅函数
    return () => {
      this.notificationHandlers.get(method)?.delete(callback);
    };
  }

  /**
   * 关闭连接
   */
  close() {
    this.stopHeartbeat();
    this.pendingRequests.forEach((pending) => {
      pending.reject(new Error("Connection closed"));
    });
    this.pendingRequests.clear();

    if (this.ws) {
      this.ws.close(1000);
      this.ws = null;
    }
  }
}

export default PythonWebSocketClient;
