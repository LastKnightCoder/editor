import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocketClient from "../WebSocketClient";
import { installWsRelay, RelayedWebSocket, WS_RELAY_PORT_NAME } from "../wsRelay";
import { RpcMessageType } from "../types";

type Handler = (message?: unknown) => void;

interface FakePort {
  name: string;
  messageHandlers: Handler[];
  disconnectHandlers: Handler[];
  peer: FakePort | null;
  onMessage: { addListener: (h: Handler) => void };
  onDisconnect: { addListener: (h: Handler) => void };
  postMessage(message: unknown): void;
  disconnect(): void;
}

/** 一端 postMessage 投递到另一端 onMessage；disconnect 只通知对端（与 chrome 语义一致） */
const createPortPair = (name: string) => {
  const make = (): FakePort => {
    const messageHandlers: Handler[] = [];
    const disconnectHandlers: Handler[] = [];
    return {
      name,
      messageHandlers,
      disconnectHandlers,
      peer: null,
      onMessage: { addListener: (h: Handler) => messageHandlers.push(h) },
      onDisconnect: { addListener: (h: Handler) => disconnectHandlers.push(h) },
      postMessage(message: unknown) {
        this.peer!.messageHandlers.forEach(h => h(message));
      },
      disconnect() {
        this.peer!.disconnectHandlers.forEach(h => h());
      },
    };
  };
  const content = make();
  const background = make();
  content.peer = background;
  background.peer = content;
  return { content, background };
};

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeSocket[] = [];
  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  private handlers: Record<string, Handler[]> = {};
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  addEventListener(type: string, h: Handler) {
    (this.handlers[type] ??= []).push(h);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close = vi.fn(() => this.fire("close"));
  fire(type: string, event?: unknown) {
    if (type === "open") this.readyState = FakeSocket.OPEN;
    if (type === "close") this.readyState = FakeSocket.CLOSED;
    (this.handlers[type] ?? []).forEach(h => h(event));
  }
}

let onConnect: ((port: unknown) => void) | null = null;

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("chrome", {
    runtime: {
      onConnect: { addListener: (h: (port: unknown) => void) => (onConnect = h) },
      connect: ({ name }: { name: string }) => {
        const pair = createPortPair(name);
        onConnect!(pair.background);
        return pair.content;
      },
    },
  });
  installWsRelay();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const connectClient = () => {
  const onOpen = vi.fn();
  const onClose = vi.fn();
  const client = new WebSocketClient("ignored", () => new RelayedWebSocket());
  client.onOpenHandler = onOpen;
  client.onCloseHandler = onClose;
  client.connect();
  const socket = FakeSocket.instances[0];
  return { client, socket, onOpen, onClose };
};

describe("wsRelay", () => {
  it("后台代连 /aiServer，请求与响应双向转发", async () => {
    const { client, socket, onOpen } = connectClient();
    expect(socket.url).toBe("ws://localhost:24678/aiServer");
    expect(client.isConnected).toBe(false);

    socket.fire("open");
    expect(onOpen).toHaveBeenCalled();
    expect(client.isConnected).toBe(true);

    const pending = client.sendRequest("ai.run.start", { runId: "r1" });
    const request = JSON.parse(socket.sent[0]);
    expect(request).toMatchObject({ method: "ai.run.start", params: { runId: "r1" } });

    socket.fire("message", {
      data: JSON.stringify({
        type: RpcMessageType.Response,
        id: request.id,
        result: { ok: true },
        error: null,
      }),
    });
    await expect(pending).resolves.toEqual({ ok: true });
  });

  it("桌面端断开：content 侧收到 close，挂起请求被拒绝", async () => {
    const { client, socket, onClose } = connectClient();
    socket.fire("open");
    const pending = client.sendRequest("ai.run.start", {});
    socket.fire("close");
    expect(onClose).toHaveBeenCalled();
    await expect(pending).rejects.toThrow("连接已断开");
  });

  it("面板关闭：content 侧断开后后台关闭真实连接", () => {
    const { client, socket, onClose } = connectClient();
    socket.fire("open");
    client.disconnect();
    expect(socket.close).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("只接管本转发通道的端口", () => {
    const pair = createPortPair("other");
    onConnect!(pair.background);
    expect(FakeSocket.instances).toHaveLength(0);
    expect(WS_RELAY_PORT_NAME).toBe("tau-ws-relay");
  });
});
