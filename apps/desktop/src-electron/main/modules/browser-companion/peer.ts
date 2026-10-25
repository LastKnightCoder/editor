/**
 * 一条扩展连接上的对等 RPC：收请求、回响应、发通知，也能反向请求扩展（页面工具）。
 * 与 ws 解耦（只依赖 send/close），便于用假 socket 单测。
 */
import { randomUUID } from "node:crypto";
import { parseRpcFrame, RPC_FRAME, type RpcFrame } from "@tau/shared/browser-companion";

export interface PeerSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type RequestHandler = (method: string, params: unknown) => Promise<unknown>;

/** 单帧上限：页面正文走对话请求，给足但不无限 */
export const MAX_FRAME_BYTES = 8 * 1024 * 1024;

export class CompanionPeer {
  private readonly pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private closed = false;

  constructor(
    private readonly socket: PeerSocket,
    private onRequest: RequestHandler
  ) {}

  setHandler(handler: RequestHandler): void {
    this.onRequest = handler;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  notify(method: string, data?: unknown): void {
    if (this.closed) return;
    this.socket.send(JSON.stringify({ type: RPC_FRAME.notification, method, data }));
  }

  request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("浏览器扩展已断开"));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`浏览器扩展响应超时：${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ type: RPC_FRAME.request, id, method, params }));
    });
  }

  /** 收到一帧；返回解析出的帧（握手阶段调用方要看首帧） */
  async receive(raw: string): Promise<RpcFrame | null> {
    if (raw.length > MAX_FRAME_BYTES) {
      this.close(1009, "frame too large");
      return null;
    }
    const frame = parseRpcFrame(raw);
    if (!frame) return null;
    if (frame.type === RPC_FRAME.response) {
      const entry = this.pending.get(frame.id);
      if (!entry) return frame;
      this.pending.delete(frame.id);
      clearTimeout(entry.timer);
      if (frame.error) entry.reject(new Error(frame.error.message));
      else entry.resolve(frame.result);
      return frame;
    }
    if (frame.type === RPC_FRAME.request) {
      let result: unknown = null;
      let error: { code: number; message: string } | null = null;
      try {
        result = await this.onRequest(frame.method, frame.params);
      } catch (cause) {
        error = { code: -32000, message: cause instanceof Error ? cause.message : String(cause) };
      }
      if (!this.closed) {
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
    return frame;
  }

  close(code = 1000, reason = ""): void {
    if (this.closed) return;
    this.dispose();
    this.socket.close(code, reason);
  }

  /** socket 已关闭：拒绝所有未决请求 */
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("浏览器扩展已断开"));
    }
    this.pending.clear();
  }
}
