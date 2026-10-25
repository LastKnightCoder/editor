/**
 * 内容脚本到后台的端口客户端。service worker 被回收时端口会断开，下次调用自动重连
 * （重连即唤醒 worker，后台随之重新连 Tau）。
 */
import {
  PORT_NAME,
  type BackgroundMethod,
  type BackgroundMethods,
  type BackgroundToContent,
  type ContentToBackground,
  type ConnectionStatus,
} from "../shared/messages";

export interface BridgeHandlers {
  onStatus(status: ConnectionStatus): void;
  onNotify(method: string, data: unknown): void;
  onPageTool(name: string, args: unknown): Promise<string>;
  onToggle(): void;
}

export class BackgroundBridge {
  private port: chrome.runtime.Port | null = null;
  private seq = 0;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private url = "";

  constructor(private readonly handlers: BridgeHandlers) {}

  /** 当前页 URL（SPA 路由变化时重报） */
  setPage(url: string): void {
    this.url = url;
    this.post({ kind: "page", url });
  }

  call<M extends BackgroundMethod>(
    method: M,
    params: BackgroundMethods[M]["params"]
  ): Promise<BackgroundMethods[M]["result"]> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.post({ kind: "call", id, method, params });
    });
  }

  /** 透传给 Tau */
  rpc<T = unknown>(method: string, params?: unknown): Promise<T> {
    return this.call("rpc", { method, params }) as Promise<T>;
  }

  private ensurePort(): chrome.runtime.Port {
    if (this.port) return this.port;
    const port = chrome.runtime.connect({ name: PORT_NAME });
    port.onMessage.addListener(message => void this.receive(message as BackgroundToContent));
    port.onDisconnect.addListener(() => {
      this.port = null;
      for (const entry of this.pending.values()) entry.reject(new Error("扩展后台已重启，请重试"));
      this.pending.clear();
    });
    this.port = port;
    if (this.url) port.postMessage({ kind: "page", url: this.url } satisfies ContentToBackground);
    return port;
  }

  private post(message: ContentToBackground): void {
    try {
      this.ensurePort().postMessage(message);
    } catch {
      // 扩展被重新加载后旧内容脚本的上下文失效，静默放弃
    }
  }

  private async receive(message: BackgroundToContent): Promise<void> {
    switch (message.kind) {
      case "result": {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        this.pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error));
        else entry.resolve(message.result);
        return;
      }
      case "status":
        this.handlers.onStatus(message.status);
        return;
      case "notify":
        this.handlers.onNotify(message.method, message.data);
        return;
      case "toggle":
        this.handlers.onToggle();
        return;
      case "pageTool": {
        try {
          const content = await this.handlers.onPageTool(message.name, message.args);
          this.post({ kind: "pageToolResult", id: message.id, content });
        } catch (error) {
          this.post({
            kind: "pageToolResult",
            id: message.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  /** 首次挂载时主动连一次，拿到连接状态 */
  start(): void {
    this.ensurePort();
  }
}
