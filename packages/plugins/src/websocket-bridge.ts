import type { PluginWebSocket } from "./websocket";

export const SOCKET_MESSAGE_BYTES = 1024 * 1024;
export const SOCKET_QUEUE_BYTES = 2 * 1024 * 1024;
export const SOCKET_QUEUE_MESSAGES = 256;
export type SocketMessage = string | Uint8Array;
export interface SocketRequest {
  url: string;
  protocols: string[];
  headers: Record<string, string>;
}
export interface SocketOpened {
  protocol: string;
  extensions: string;
}
export interface SocketClosed {
  type: "close";
  code: number;
  reason: string;
  wasClean: boolean;
}
export type SocketIncoming = { type: "message"; data: SocketMessage } | SocketClosed;
export interface SocketBridge {
  open(id: string, request: SocketRequest): Promise<SocketOpened>;
  send(id: string, message: SocketMessage): Promise<void>;
  receive(id: string): Promise<SocketIncoming>;
  close(id: string, code?: number, reason?: string): Promise<void>;
  dispose(id: string): Promise<void>;
}
const token = /^[!#$%&'*+.^_`|~0-9a-z-]+$/i;
export function validateSocketRequest(request: SocketRequest): void {
  const url = new URL(request.url);
  if (url.hash || request.url.includes("#"))
    throw new DOMException("WebSocket 地址不能包含片段", "SyntaxError");
  if (
    url.username ||
    url.password ||
    (url.protocol !== "wss:" &&
      !(url.protocol === "ws:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  )
    throw new DOMException("WebSocket 需要安全地址，本机测试可使用 ws", "SecurityError");
  if (
    !Array.isArray(request.protocols) ||
    request.protocols.some(value => typeof value !== "string" || !token.test(value)) ||
    new Set(request.protocols).size !== request.protocols.length
  )
    throw new DOMException("WebSocket 子协议无效或重复", "SyntaxError");
  for (const [key, value] of Object.entries(request.headers)) {
    if (
      !token.test(key) ||
      typeof value !== "string" ||
      /[\r\n]/.test(value) ||
      /^(host|connection|upgrade|sec-websocket-.*)$/i.test(key)
    )
      throw new TypeError("WebSocket 请求头无效或由宿主管理");
  }
}
export function validateSocketClose(code?: number, reason = ""): void {
  if (
    code !== undefined &&
    code !== 1000 &&
    !(Number.isInteger(code) && code >= 3000 && code <= 4999)
  )
    throw new DOMException("WebSocket 关闭码必须为 1000 或 3000–4999", "InvalidAccessError");
  if (new TextEncoder().encode(reason).byteLength > 123)
    throw new DOMException("WebSocket 关闭原因超过 123 字节", "SyntaxError");
}
const nextTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));
class HostSocket extends EventTarget implements WebSocket {
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  private state: number = this.CONNECTING;
  private buffered = 0;
  private queuedMessages = 0;
  private selectedProtocol = "";
  private selectedExtensions = "";
  private binary: BinaryType = "blob";
  private sending: Promise<void> = Promise.resolve();
  private closeTimer?: ReturnType<typeof setTimeout>;
  private readonly id = crypto.randomUUID();
  private handlers = new Map<string, { value: Function | null; listener: EventListener }>();
  readonly url: string;
  get readyState() {
    return this.state;
  }
  get bufferedAmount() {
    return this.buffered;
  }
  get protocol() {
    return this.selectedProtocol;
  }
  get extensions() {
    return this.selectedExtensions;
  }
  get binaryType() {
    return this.binary;
  }
  set binaryType(value: BinaryType) {
    if (value === "blob" || value === "arraybuffer") this.binary = value;
  }
  get onopen(): WebSocket["onopen"] {
    return this.handler("open");
  }
  set onopen(value: WebSocket["onopen"]) {
    this.setHandler("open", value);
  }
  get onmessage(): WebSocket["onmessage"] {
    return this.handler("message");
  }
  set onmessage(value: WebSocket["onmessage"]) {
    this.setHandler("message", value);
  }
  get onerror(): WebSocket["onerror"] {
    return this.handler("error");
  }
  set onerror(value: WebSocket["onerror"]) {
    this.setHandler("error", value);
  }
  get onclose(): WebSocket["onclose"] {
    return this.handler("close");
  }
  set onclose(value: WebSocket["onclose"]) {
    this.setHandler("close", value);
  }
  private handler<T>(type: string): T {
    return (this.handlers.get(type)?.value ?? null) as T;
  }
  private setHandler(type: string, value: Function | null) {
    const previous = this.handlers.get(type);
    if (previous) {
      previous.value = value;
      if (!value) {
        this.removeEventListener(type, previous.listener);
        this.handlers.delete(type);
      }
    } else if (typeof value === "function") {
      const handler = {
        value,
        listener: ((event: Event) => handler.value?.call(this, event)) as EventListener,
      };
      this.handlers.set(type, handler);
      this.addEventListener(type, handler.listener);
    }
  }
  constructor(
    private bridge: SocketBridge,
    request: SocketRequest,
    private signal?: AbortSignal
  ) {
    super();
    this.url = request.url;
    signal?.addEventListener("abort", this.abort, { once: true });
    void this.open(request);
  }
  private abort = () => {
    this.state = this.CLOSING;
    void nextTask().then(() => this.fail());
  };
  private async open(request: SocketRequest) {
    // 事件进入任务队列，调用方可在工厂返回后立即安装监听器。
    await nextTask();
    if (this.signal?.aborted || this.state !== this.CONNECTING) {
      this.fail();
      return;
    }
    try {
      const opened = await this.bridge.open(this.id, request);
      await nextTask();
      if (this.state !== this.CONNECTING) {
        void this.bridge.dispose(this.id).catch(() => undefined);
        return;
      }
      this.selectedProtocol = opened.protocol;
      this.selectedExtensions = opened.extensions;
      this.state = this.OPEN;
      this.dispatchEvent(new Event("open"));
      while (this.state !== this.CLOSED) {
        const incoming = await this.bridge.receive(this.id);
        await nextTask();
        if (this.state === this.CLOSED) return;
        if (incoming.type === "close") {
          if (incoming.wasClean) this.finish(incoming);
          else this.fail();
          return;
        }
        if (this.state !== this.OPEN) continue;
        const bytes =
          typeof incoming.data === "string" ? undefined : new Uint8Array(incoming.data).buffer;
        const data = bytes ? (this.binary === "blob" ? new Blob([bytes]) : bytes) : incoming.data;
        this.dispatchEvent(new MessageEvent("message", { data, origin: new URL(this.url).origin }));
      }
    } catch {
      this.fail();
    }
  }
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.state === this.CONNECTING)
      throw new DOMException("WebSocket 尚未连接", "InvalidStateError");
    const bytes =
      typeof data === "string"
        ? new TextEncoder().encode(data).byteLength
        : data instanceof Blob
          ? data.size
          : data.byteLength;
    this.buffered += bytes;
    if (this.state !== this.OPEN) return;
    if (
      bytes > SOCKET_MESSAGE_BYTES ||
      this.buffered > SOCKET_QUEUE_BYTES ||
      ++this.queuedMessages > SOCKET_QUEUE_MESSAGES
    ) {
      this.state = this.CLOSING;
      void nextTask().then(() => this.fail());
      return;
    }
    const snapshot =
      typeof data === "string" || data instanceof Blob
        ? data
        : ArrayBuffer.isView(data)
          ? new Uint8Array(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
          : new Uint8Array(new Uint8Array(data));
    this.sending = this.sending.then(async () => {
      if (this.state === this.CLOSED) return;
      const message =
        snapshot instanceof Blob ? new Uint8Array(await snapshot.arrayBuffer()) : snapshot;
      if (this.state === this.CLOSED) return;
      await this.bridge.send(this.id, message);
      this.buffered -= bytes;
      this.queuedMessages--;
    });
    void this.sending.catch(() => this.fail());
  }
  close(code?: number, reason = ""): void {
    validateSocketClose(code, reason);
    if (this.state === this.CLOSING || this.state === this.CLOSED) return;
    if (this.state === this.CONNECTING) {
      this.abort();
      return;
    }
    this.state = this.CLOSING;
    this.closeTimer = setTimeout(() => this.fail(), 10_000);
    void this.sending
      .then(() =>
        this.state !== this.CLOSED ? this.bridge.close(this.id, code, reason) : undefined
      )
      .catch(() => this.fail());
  }
  private fail() {
    if (this.state === this.CLOSED) return;
    this.state = this.CLOSED;
    this.dispatchEvent(new Event("error"));
    this.finish({ type: "close", code: 1006, reason: "", wasClean: false });
  }
  private finished = false;
  private finish(event: SocketClosed) {
    if (this.finished) return;
    this.finished = true;
    this.state = this.CLOSED;
    clearTimeout(this.closeTimer);
    this.signal?.removeEventListener("abort", this.abort);
    void this.bridge.dispose(this.id).catch(() => undefined);
    this.dispatchEvent(new CloseEvent("close", event));
  }
}
export function createBridgeWebSocket(bridge: SocketBridge): PluginWebSocket {
  return {
    connect(url, protocols = [], options = {}) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new DOMException("WebSocket 地址无效", "SyntaxError");
      }
      if (parsed.protocol === "https:") parsed.protocol = "wss:";
      if (parsed.protocol === "http:") parsed.protocol = "ws:";
      const request = {
        url: parsed.href,
        protocols: typeof protocols === "string" ? [protocols] : [...protocols],
        headers: { ...options.headers },
      };
      validateSocketRequest(request);
      return new HostSocket(bridge, request, options.signal);
    },
  };
}
