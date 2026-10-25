/**
 * 到 Tau 的一条 WebSocket 上的对等 RPC：发请求、收响应与通知，也响应 Tau 的反向请求（页面工具）。
 */
import { parseRpcFrame, RPC_FRAME } from "@tau/shared/browser-companion";

export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export interface RpcSocketHandlers {
  onNotification(method: string, data: unknown): void;
  onRequest(method: string, params: unknown): Promise<unknown>;
  onClose(code: number): void;
}

const OPEN = 1;

export class RpcSocket {
  private seq = 0;
  private readonly pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private closed = false;

  constructor(
    private readonly socket: SocketLike,
    private readonly handlers: RpcSocketHandlers
  ) {
    socket.onmessage = event => void this.receive(String(event.data));
    socket.onclose = event => this.finish(event.code);
    socket.onerror = () => {};
  }

  /** 等连接打开；失败（Tau 没运行）时 reject */
  static open(socket: SocketLike): Promise<void> {
    return new Promise((resolve, reject) => {
      if (socket.readyState === OPEN) return resolve();
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("无法连接 Tau"));
      socket.onclose = () => reject(new Error("无法连接 Tau"));
    });
  }

  get isOpen() {
    return !this.closed && this.socket.readyState === OPEN;
  }

  request<T = unknown>(method: string, params?: unknown, timeoutMs = 30_000): Promise<T> {
    if (!this.isOpen) return Promise.reject(new Error("Tau 未连接"));
    const id = `e${++this.seq}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Tau 响应超时：${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      this.socket.send(JSON.stringify({ type: RPC_FRAME.request, id, method, params }));
    });
  }

  notify(method: string, data?: unknown): void {
    if (this.isOpen)
      this.socket.send(JSON.stringify({ type: RPC_FRAME.notification, method, data }));
  }

  close(): void {
    this.socket.close(1000);
    this.finish(1000);
  }

  private async receive(raw: string): Promise<void> {
    const frame = parseRpcFrame(raw);
    if (!frame) return;
    if (frame.type === RPC_FRAME.notification) {
      this.handlers.onNotification(frame.method, frame.data);
      return;
    }
    if (frame.type === RPC_FRAME.response) {
      const entry = this.pending.get(frame.id);
      if (!entry) return;
      this.pending.delete(frame.id);
      clearTimeout(entry.timer);
      if (frame.error) entry.reject(new Error(frame.error.message));
      else entry.resolve(frame.result);
      return;
    }
    let result: unknown = null;
    let error: { code: number; message: string } | null = null;
    try {
      result = await this.handlers.onRequest(frame.method, frame.params);
    } catch (cause) {
      error = { code: -32000, message: cause instanceof Error ? cause.message : String(cause) };
    }
    if (this.isOpen) {
      this.socket.send(
        JSON.stringify({
          type: RPC_FRAME.response,
          id: frame.id,
          method: frame.method,
          result,
          error,
        })
      );
    }
  }

  private finish(code: number): void {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("Tau 连接已断开"));
    }
    this.pending.clear();
    this.handlers.onClose(code);
  }
}
