import WebSocket, { type RawData } from "ws";
import {
  SOCKET_MESSAGE_BYTES,
  SOCKET_QUEUE_BYTES,
  SOCKET_QUEUE_MESSAGES,
  validateSocketRequest,
  validateSocketClose,
  type SocketRequest,
  type SocketMessage,
  type SocketIncoming,
  type SocketClosed,
} from "@tau/plugins/websocket-bridge";

interface Connection {
  socket: WebSocket;
  queue: SocketMessage[];
  bytes: number;
  closed?: SocketClosed;
  error?: Error;
  reader?: { resolve(value: SocketIncoming): void; reject(error: Error): void };
}
const byteLength = (message: SocketMessage) =>
  typeof message === "string" ? Buffer.byteLength(message) : message.byteLength;
export class PluginWebSocketService {
  private connections = new Map<string, Connection>();
  private key(owner: number, id: string) {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error("WebSocket 连接身份无效");
    return `${owner}:${id}`;
  }
  async open(owner: number, id: string, request: SocketRequest) {
    validateSocketRequest(request);
    const key = this.key(owner, id);
    if (this.connections.has(key)) throw new Error("WebSocket 连接已存在");
    if ([...this.connections.keys()].filter(value => value.startsWith(`${owner}:`)).length >= 32)
      throw new Error("WebSocket 连接过多");
    const socket = new WebSocket(request.url, request.protocols, {
      headers: request.headers,
      maxPayload: SOCKET_MESSAGE_BYTES,
      handshakeTimeout: 10_000,
      followRedirects: false,
    });
    const connection: Connection = { socket, queue: [], bytes: 0 };
    this.connections.set(key, connection);
    const fail = () => {
      connection.error = new Error("WebSocket 连接失败");
      connection.reader?.reject(connection.error);
      connection.reader = undefined;
    };
    socket.on("message", (data: RawData, binary: boolean) => {
      const buffer = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
      const message = binary ? new Uint8Array(buffer) : buffer.toString("utf8");
      if (connection.reader) {
        const reader = connection.reader;
        connection.reader = undefined;
        reader.resolve({ type: "message", data: message });
      } else if (
        connection.bytes + buffer.byteLength <= SOCKET_QUEUE_BYTES &&
        connection.queue.length < SOCKET_QUEUE_MESSAGES
      ) {
        connection.queue.push(message);
        connection.bytes += buffer.byteLength;
      } else {
        fail();
        socket.terminate();
      }
    });
    socket.on("error", fail);
    socket.on("close", (code, reason) => {
      connection.closed = {
        type: "close",
        code,
        reason: reason.toString(),
        wasClean: code !== 1006,
      };
      connection.reader?.resolve(connection.closed);
      connection.reader = undefined;
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", () => reject(new Error("WebSocket 握手失败，请检查网络与账号")));
        socket.once("close", () => reject(new Error("WebSocket 连接已关闭")));
      });
      return { protocol: socket.protocol, extensions: socket.extensions };
    } catch (error) {
      this.dispose(owner, id);
      throw error;
    }
  }
  async send(owner: number, id: string, message: SocketMessage) {
    const connection = this.get(this.key(owner, id));
    if (
      byteLength(message) > SOCKET_MESSAGE_BYTES ||
      connection.socket.bufferedAmount + byteLength(message) > SOCKET_QUEUE_BYTES
    )
      throw new Error("WebSocket 发送队列已满");
    await new Promise<void>((resolve, reject) =>
      connection.socket.send(message, error =>
        error ? reject(new Error("WebSocket 发送失败")) : resolve()
      )
    );
  }
  async receive(owner: number, id: string): Promise<SocketIncoming> {
    const connection = this.get(this.key(owner, id));
    if (connection.reader) throw new Error("WebSocket 只允许一个读取者");
    if (connection.error) throw connection.error;
    const message = connection.queue.shift();
    if (message !== undefined) {
      connection.bytes -= byteLength(message);
      return { type: "message", data: message };
    }
    if (connection.closed) return connection.closed;
    return new Promise((resolve, reject) => {
      connection.reader = { resolve, reject };
    });
  }
  private get(key: string) {
    const connection = this.connections.get(key);
    if (!connection) throw new Error("WebSocket 连接已结束");
    return connection;
  }
  close(owner: number, id: string, code?: number, reason?: string) {
    validateSocketClose(code, reason);
    this.get(this.key(owner, id)).socket.close(code, reason);
  }
  dispose(owner: number, id: string) {
    this.closeKey(this.key(owner, id));
  }
  private closeKey(key: string) {
    const connection = this.connections.get(key);
    if (!connection) return;
    this.connections.delete(key);
    connection.reader?.reject(new Error("WebSocket 连接已取消"));
    connection.reader = undefined;
    connection.queue = [];
    if (connection.socket.readyState !== WebSocket.CLOSED) connection.socket.terminate();
  }
  releaseOwner(owner: number) {
    for (const key of this.connections.keys()) if (key.startsWith(`${owner}:`)) this.closeKey(key);
  }
}
