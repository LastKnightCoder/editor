import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RpcEventHub } from "../event-hub";
import type { EventMessage } from "@tau/rpc";

const configMock = vi.hoisted(() => ({
  getRpcConfig: vi.fn(),
}));

vi.mock("../config", () => configMock);

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  sent: string[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.onclose?.();
  }

  // 模拟服务端下发 rpc-event 通知
  emitEvent(data: EventMessage) {
    this.onmessage?.({
      data: JSON.stringify({
        type: "JsonRpcNotification",
        method: "rpc-event",
        data,
      }),
    });
  }
}

function defaultConfig(overrides: Record<string, unknown> = {}) {
  return {
    baseUrl: "http://127.0.0.1:24678",
    token: "t",
    windowId: 5,
    ...overrides,
  };
}

describe("RpcEventHub", () => {
  let hub: RpcEventHub;

  beforeEach(() => {
    hub = new RpcEventHub();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    configMock.getRpcConfig.mockResolvedValue(defaultConfig());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("start 后建立 WS 连接，url 由 http baseUrl 推导并附带 token", async () => {
    await hub.start();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toBe(
      "ws://127.0.0.1:24678/rpc-events?isServer=false&token=t"
    );
  });

  it("baseUrl 为空（同源部署）时按页面协议推导 ws url", async () => {
    configMock.getRpcConfig.mockResolvedValue(defaultConfig({ baseUrl: "" }));

    await hub.start();

    const { protocol, host } = window.location;
    const expectedProtocol = protocol === "https:" ? "wss:" : "ws:";
    expect(FakeWebSocket.instances[0].url).toBe(
      `${expectedProtocol}//${host}/rpc-events?isServer=false&token=t`
    );
  });

  it("start 失败后自动退避重试（配置竞态自愈）", async () => {
    vi.useFakeTimers();
    try {
      configMock.getRpcConfig
        .mockRejectedValueOnce(new Error("bootstrap not ready"))
        .mockResolvedValue(defaultConfig());

      // 首次失败不抛出，事件系统不永久失效
      await hub.start();
      expect(FakeWebSocket.instances).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(3100);

      expect(FakeWebSocket.instances).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("按 windowId 过滤定向事件：本端 id 收得到，他人 id 收不到，0 广播收得到", async () => {
    await hub.start();
    const listener = vi.fn();
    hub.on("doc-updated", listener);
    const ws = FakeWebSocket.instances[0];

    ws.emitEvent({ channel: "doc-updated", args: [], windowId: 5 });
    ws.emitEvent({ channel: "doc-updated", args: [], windowId: 6 });
    ws.emitEvent({ channel: "doc-updated", args: [], windowId: 0 });

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("本端 windowId 为 0（Web 模式）时接收全部事件", async () => {
    configMock.getRpcConfig.mockResolvedValue(defaultConfig({ windowId: 0 }));
    await hub.start();
    const listener = vi.fn();
    hub.on("doc-updated", listener);

    FakeWebSocket.instances[0].emitEvent({
      channel: "doc-updated",
      args: [],
      windowId: 99,
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("分发时以占位 event 补齐 IPC 契约签名，并还原信封类型", async () => {
    await hub.start();
    const listener = vi.fn();
    hub.on("doc-updated", listener);

    FakeWebSocket.instances[0].emitEvent({
      channel: "doc-updated",
      args: [{ $__t: "date", v: "2026-01-01T00:00:00.000Z" }],
      windowId: 5,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    const [mockEvent, payload] = listener.mock.calls[0];
    expect(mockEvent).toBeTruthy();
    expect(payload).toBeInstanceOf(Date);
    expect((payload as Date).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("off 后不再分发；非 rpc-event 通知被忽略", async () => {
    await hub.start();
    const listener = vi.fn();
    hub.on("doc-updated", listener);
    hub.off("doc-updated", listener);

    const ws = FakeWebSocket.instances[0];
    ws.emitEvent({ channel: "doc-updated", args: [], windowId: 5 });
    ws.onmessage?.({
      data: JSON.stringify({ type: "JsonRpcNotification", method: "server-ready" }),
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("单个监听器抛错不影响其余监听器", async () => {
    await hub.start();
    const bad = vi.fn(() => {
      throw new Error("listener crashed");
    });
    const good = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    hub.on("doc-updated", bad);
    hub.on("doc-updated", good);

    FakeWebSocket.instances[0].emitEvent({
      channel: "doc-updated",
      args: [],
      windowId: 5,
    });

    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });
});
