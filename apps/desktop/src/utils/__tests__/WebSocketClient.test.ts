import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import WebSocketClient from "../WebSocketClient";
import { RpcMessageType } from "@/types";

type Listener = (event?: any) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  sentMessages: string[] = [];
  private listeners = new Map<string, Listener[]>();

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  send(message: string) {
    this.sentMessages.push(message);
  }

  close(code = 1000, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close", { code, reason });
  }

  emit(type: string, event?: any) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.emit("open");
  }

  message(data: unknown) {
    this.emit("message", { data: JSON.stringify(data) });
  }
}

describe("utils/WebSocketClient", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    globalThis.WebSocket = originalWebSocket;
    vi.restoreAllMocks();
  });

  it("sendRequest 会等待 socket 打开后再发送", async () => {
    const client = new WebSocketClient("ws://localhost:24678/backendServer");
    const socket = MockWebSocket.instances[0];

    const requestPromise = client.sendRequest(
      "pomodoro:get-active-session",
      null,
    );

    expect(socket.sentMessages).toHaveLength(0);

    socket.open();
    await Promise.resolve();

    expect(socket.sentMessages).toHaveLength(1);

    const payload = JSON.parse(socket.sentMessages[0]);
    socket.message({
      id: payload.id,
      type: RpcMessageType.Response,
      method: payload.method,
      result: { id: 1 },
      error: null,
    });

    await expect(requestPromise).resolves.toEqual({ id: 1 });
  });

  it("close 后会自动重连并保留通知 handler", async () => {
    const client = new WebSocketClient("ws://localhost:24678/backendServer");
    const handler = vi.fn();
    client.registerNotificationHandler("pomodoro:tick", handler);

    const firstSocket = MockWebSocket.instances[0];
    firstSocket.open();
    firstSocket.close(1006, "abnormal");
    vi.advanceTimersByTime(1000);

    expect(MockWebSocket.instances).toHaveLength(2);

    const secondSocket = MockWebSocket.instances[1];
    secondSocket.open();
    secondSocket.message({
      type: RpcMessageType.Notification,
      method: "pomodoro:tick",
      data: { elapsedMs: 1000 },
    });

    expect(handler).toHaveBeenCalledWith({ elapsedMs: 1000 });
  });
});
