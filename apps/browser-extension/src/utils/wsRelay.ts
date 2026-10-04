import { AI_SERVER_WS_URL } from "./aiServerAddress";

/**
 * content script 的 WebSocket 经后台转发。
 *
 * content script 直连 ws://localhost 时握手带的是所在网页的 Origin，会被桌面端按跨站来源拒绝；
 * 改由后台 service worker（chrome-extension:// 来源）代为连接，经 runtime Port 双向转发。
 * 网页无法 connect 到本扩展（未声明 externally_connectable），转发通道只对自家 content script 开放。
 */

export const WS_RELAY_PORT_NAME = "tau-ws-relay";

// 端口消息会重置 service worker 的空闲计时，空闲面板靠它保住连接
const KEEPALIVE_INTERVAL_MS = 20 * 1000;

type RelayToContent = { type: "open" } | { type: "message"; data: string };
type RelayToBackground = { type: "send"; data: string } | { type: "keepalive" };

/** WebSocketClient 用到的 WebSocket 子集 */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
}

type Listener = (event: MessageEvent) => void;

/** content script 侧：表现为一个 WebSocket，实际经后台转发到 /aiServer */
export class RelayedWebSocket implements WebSocketLike {
  private state: number = WebSocket.CONNECTING;
  private readonly port: chrome.runtime.Port;
  private readonly listeners: Record<string, Listener[]> = {};
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.port = chrome.runtime.connect({ name: WS_RELAY_PORT_NAME });
    this.port.onMessage.addListener((message: RelayToContent) => {
      if (message.type === "open") {
        this.state = WebSocket.OPEN;
        this.keepaliveTimer = setInterval(
          () => this.post({ type: "keepalive" }),
          KEEPALIVE_INTERVAL_MS
        );
        this.emit("open");
      } else if (message.type === "message") {
        this.emit("message", message.data);
      }
    });
    this.port.onDisconnect.addListener(() => this.handleClosed());
  }

  get readyState() {
    return this.state;
  }

  send(data: string) {
    if (this.state !== WebSocket.OPEN) throw new Error("WebSocket 未连接");
    this.post({ type: "send", data });
  }

  close() {
    if (this.state === WebSocket.CLOSED) return;
    this.port.disconnect();
    this.handleClosed();
  }

  addEventListener(type: string, listener: Listener) {
    (this.listeners[type] ??= []).push(listener);
  }

  private post(message: RelayToBackground) {
    this.port.postMessage(message);
  }

  private emit(type: string, data?: string) {
    const event = new MessageEvent(type, { data });
    for (const listener of this.listeners[type] ?? []) listener(event);
  }

  private handleClosed() {
    if (this.state === WebSocket.CLOSED) return;
    this.state = WebSocket.CLOSED;
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    this.keepaliveTimer = null;
    this.emit("close");
  }
}

/** 后台侧：为每个 content script 端口建一条到 /aiServer 的真实连接 */
export function installWsRelay() {
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== WS_RELAY_PORT_NAME) return;

    const ws = new WebSocket(AI_SERVER_WS_URL);
    let portOpen = true;
    const toContent = (message: RelayToContent) => {
      if (portOpen) port.postMessage(message);
    };

    ws.addEventListener("open", () => toContent({ type: "open" }));
    ws.addEventListener("message", event => toContent({ type: "message", data: event.data }));
    ws.addEventListener("close", () => {
      if (!portOpen) return;
      portOpen = false;
      port.disconnect();
    });

    port.onMessage.addListener((message: RelayToBackground) => {
      if (message.type === "send" && ws.readyState === WebSocket.OPEN) ws.send(message.data);
    });
    port.onDisconnect.addListener(() => {
      portOpen = false;
      ws.close();
    });
  });
}
