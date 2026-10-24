import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBridgeWebSocket,
  SOCKET_QUEUE_BYTES,
  type SocketBridge,
  type SocketIncoming,
} from "../websocket-bridge";

class TestCloseEvent extends Event {
  code: number;
  reason: string;
  wasClean: boolean;
  constructor(type: string, init: CloseEventInit = {}) {
    super(type);
    this.code = init.code ?? 0;
    this.reason = init.reason ?? "";
    this.wasClean = init.wasClean ?? false;
  }
}
vi.stubGlobal("CloseEvent", TestCloseEvent);
const tick = () => vi.advanceTimersByTimeAsync(20);
beforeEach(() => vi.useFakeTimers());
function harness() {
  const incoming: SocketIncoming[] = [];
  let reader: ((event: SocketIncoming) => void) | undefined;
  const push = (event: SocketIncoming) => {
    if (reader) {
      const consume = reader;
      reader = undefined;
      consume(event);
    } else incoming.push(event);
  };
  const bridge: SocketBridge = {
    open: vi.fn(async () => ({ protocol: "asr", extensions: "" })),
    send: vi.fn(async () => undefined),
    receive: vi.fn(() =>
      incoming.length
        ? Promise.resolve(incoming.shift()!)
        : new Promise<SocketIncoming>(resolve => {
            reader = resolve;
          })
    ),
    close: vi.fn(async (_id, code, reason) => {
      push({ type: "close", code: code ?? 1005, reason: reason ?? "", wasClean: true });
    }),
    dispose: vi.fn(async () => undefined),
  };
  const controller = new AbortController();
  const api = createBridgeWebSocket(bridge);
  const socket = api.connect("wss://example.com/asr", ["asr"], {
    signal: controller.signal,
    headers: { "X-Api-Key": "test-only" },
  });
  return { api, socket, bridge, push, controller };
}
const cleanup: AbortController[] = [];
afterEach(async () => {
  cleanup.splice(0).forEach(controller => controller.abort());
  await tick();
  vi.useRealTimers();
});
function create() {
  const value = harness();
  cleanup.push(value.controller);
  return value;
}
describe("标准 WebSocket 宿主桥", () => {
  it("同步返回 CONNECTING，open 异步，保留事件目标和协商协议", async () => {
    const { socket, bridge } = create();
    expect(socket.readyState).toBe(socket.CONNECTING);
    expect(() => socket.send("early")).toThrowError(/尚未连接/);
    const open = vi.fn(function (this: WebSocket, event: Event) {
      expect(this).toBe(socket);
      expect(event.target).toBe(socket);
    });
    socket.onopen = open;
    await tick();
    expect(open).toHaveBeenCalledTimes(1);
    expect(socket.protocol).toBe("asr");
    expect(socket.readyState).toBe(socket.OPEN);
    expect(bridge.open).toHaveBeenCalledWith(expect.any(String), {
      url: socket.url,
      protocols: ["asr"],
      headers: { "X-Api-Key": "test-only" },
    });
  });
  it("send 同步返回，复制视图并保持 Blob、文本发送顺序和 bufferedAmount", async () => {
    const { socket, bridge } = create();
    await tick();
    let drain!: () => void;
    vi.mocked(bridge.send).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          drain = resolve;
        })
    );
    const bytes = new Uint8Array([1, 2, 3]);
    expect(socket.send(bytes.subarray(1))).toBeUndefined();
    bytes.fill(9);
    socket.send(new Blob(["甲"]));
    socket.send("乙");
    expect(socket.bufferedAmount).toBe(8);
    await tick();
    expect(bridge.send).toHaveBeenCalledTimes(1);
    expect(vi.mocked(bridge.send).mock.calls[0][1]).toEqual(new Uint8Array([2, 3]));
    drain();
    await tick();
    expect(socket.bufferedAmount).toBe(0);
    expect(vi.mocked(bridge.send).mock.calls.map(call => call[1])).toEqual([
      new Uint8Array([2, 3]),
      new TextEncoder().encode("甲"),
      "乙",
    ]);
  });
  it("消息支持默认 Blob、ArrayBuffer 与标准监听移除", async () => {
    const { socket, push } = create();
    await tick();
    const values: unknown[] = [];
    socket.onmessage = event => values.push(event.data);
    const removed = vi.fn();
    socket.addEventListener("message", removed);
    socket.removeEventListener("message", removed);
    push({ type: "message", data: new Uint8Array([8]) });
    await tick();
    expect(values[0]).toBeInstanceOf(Blob);
    socket.binaryType = "arraybuffer";
    push({ type: "message", data: new Uint8Array([9]) });
    push({ type: "message", data: "正文" });
    await tick();
    expect(new Uint8Array(values[1] as ArrayBuffer)).toEqual(new Uint8Array([9]));
    expect(values[2]).toBe("正文");
    expect(removed).not.toHaveBeenCalled();
  });
  it("close 排空发送，回传关闭码与原因，不接受关闭后的消息", async () => {
    const { socket, bridge, push } = create();
    await tick();
    let drain!: () => void;
    vi.mocked(bridge.send).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          drain = resolve;
        })
    );
    const closed = vi.fn();
    socket.onclose = closed;
    const message = vi.fn();
    socket.onmessage = message;
    socket.send("尾帧");
    expect(socket.close(3001, "完成")).toBeUndefined();
    expect(socket.readyState).toBe(socket.CLOSING);
    push({ type: "message", data: "迟到" });
    await tick();
    expect(bridge.close).not.toHaveBeenCalled();
    drain();
    await tick();
    expect(closed).toHaveBeenCalledWith(
      expect.objectContaining({ code: 3001, reason: "完成", wasClean: true })
    );
    expect(socket.readyState).toBe(socket.CLOSED);
    expect(message).not.toHaveBeenCalled();
    socket.send("丢弃");
    expect(socket.bufferedAmount).toBe(6);
    expect(bridge.send).toHaveBeenCalledTimes(1);
  });
  it("关闭参数在重复关闭时仍校验", async () => {
    const { socket } = create();
    await tick();
    socket.close();
    expect(() => socket.close(1001)).toThrowError(/关闭码/);
    expect(() => socket.close(1000, "中".repeat(42))).toThrowError(/123/);
  });
  it("握手失败仅发出一次 error 和非正常 close，不泄漏原生错误", async () => {
    const { socket, bridge } = create();
    vi.mocked(bridge.open).mockRejectedValue(new Error("sensitive"));
    const events: string[] = [];
    socket.onerror = () => events.push("error");
    socket.onclose = event => {
      events.push("close");
      expect(event.code).toBe(1006);
      expect(event.reason).toBe("");
    };
    await tick();
    expect(events).toEqual(["error", "close"]);
    expect(socket.readyState).toBe(socket.CLOSED);
  });
  it("连接中取消回收迟到连接，没有 open 事件", async () => {
    const { socket, bridge, controller } = create();
    let resolve!: (value: { protocol: string; extensions: string }) => void;
    vi.mocked(bridge.open).mockImplementation(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    const open = vi.fn();
    socket.onopen = open;
    await tick();
    controller.abort();
    await tick();
    resolve({ protocol: "", extensions: "" });
    await tick();
    expect(open).not.toHaveBeenCalled();
    expect(socket.readyState).toBe(socket.CLOSED);
    expect(bridge.dispose).toHaveBeenCalledTimes(2);
  });
  it("背压超限由宿主关闭，send 不返回 Promise 或队列异常", async () => {
    const { socket } = create();
    await tick();
    const error = vi.fn();
    socket.onerror = error;
    expect(socket.send(new Uint8Array(SOCKET_QUEUE_BYTES + 1))).toBeUndefined();
    await tick();
    expect(error).toHaveBeenCalledTimes(1);
    expect(socket.readyState).toBe(socket.CLOSED);
    const empty = create();
    await tick();
    for (let index = 0; index < 257; index++) empty.socket.send("");
    await tick();
    expect(empty.socket.readyState).toBe(empty.socket.CLOSED);
  });
  it("非法地址、重复协议、握手头和注入头同步拒绝", () => {
    const { api } = create();
    for (const url of ["file:///secret", "ws://remote.example.com", "wss://example.com/#"])
      expect(() => api.connect(url)).toThrow();
    expect(() => api.connect("wss://example.com", ["a", "a"])).toThrow();
    for (const headers of [
      { Host: "secret" },
      { "Sec-WebSocket-Key": "x" },
      { Key: "x\r\ny" },
    ] as Record<string, string>[])
      expect(() => api.connect("wss://example.com", [], { headers })).toThrow();
  });
});
