// @vitest-environment node
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InferenceClient } from "../local-inference/client";
import type { InferenceInput, InferenceRequest } from "../local-inference/protocol";

const electron = vi.hoisted(() => ({ fork: vi.fn(), once: vi.fn() }));
vi.mock("electron", () => ({
  utilityProcess: { fork: electron.fork },
  app: { once: electron.once },
}));

class FakeProcess extends EventEmitter {
  postMessage = vi.fn();
  kill = vi.fn();
  ready() {
    this.emit("message", { kind: "ready" });
  }
  complete() {
    const request = this.postMessage.mock.lastCall![0] as InferenceRequest;
    this.emit("message", {
      kind: "result",
      id: request.id,
      result: { kind: "embed", value: { embeddings: [[1, 0]], dimensions: 2, device: "cpu" } },
    });
  }
}

const input = (text: string): InferenceInput => ({
  kind: "embed",
  text,
  modelPath: "model.gguf",
  devicePolicy: "cpu",
});
let child: FakeProcess;
let client: InferenceClient;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  child = new FakeProcess();
  electron.fork.mockReturnValue(child);
  client = new InferenceClient();
});
afterEach(() => {
  client.dispose();
  vi.useRealTimers();
});

describe("本地推理子进程调度", () => {
  it("等待握手且只派发一条任务，查询在当前文本结束后优先执行", async () => {
    const first = client.request(input("重建一"), "background");
    expect(child.postMessage).not.toHaveBeenCalled();
    child.ready();
    await vi.advanceTimersByTimeAsync(10);
    const second = client.request(input("重建二"), "background");
    const query = client.request(input("搜索"), "interactive");
    expect(child.postMessage).toHaveBeenCalledTimes(1);
    child.complete();
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(child.postMessage.mock.lastCall![0].text).toBe("搜索");
    child.complete();
    await query;
    await vi.advanceTimersByTimeAsync(9);
    expect(child.postMessage).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(child.postMessage.mock.lastCall![0].text).toBe("重建二");
    child.complete();
    await second;
    expect(electron.fork).toHaveBeenCalledTimes(1);
  });

  it("进程退出拒绝全部任务，下次请求重新启动，旧进程事件不污染新请求", async () => {
    const first = client.request(input("一"), "background");
    child.ready();
    await vi.advanceTimersByTimeAsync(10);
    const second = client.request(input("二"), "background");
    const settled = Promise.allSettled([first, second]);
    child.emit("exit", 1);
    expect((await settled).map(item => item.status)).toEqual(["rejected", "rejected"]);
    const oldChild = child;
    child = new FakeProcess();
    electron.fork.mockReturnValue(child);
    const next = client.request(input("重试"), "interactive");
    oldChild.emit("exit", 1);
    oldChild.complete();
    child.ready();
    await vi.advanceTimersByTimeAsync(0);
    child.complete();
    await expect(next).resolves.toMatchObject({ kind: "embed" });
    expect(electron.once).toHaveBeenCalledTimes(1);
  });

  it("启动超时终止子进程，不留下悬挂 Promise", async () => {
    const result = client.request(input("一"), "background");
    const rejected = expect(result).rejects.toThrow("启动超时");
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("原生进程致命错误不会成为主进程的未处理 error 事件", async () => {
    const result = client.request(input("一"), "background");
    const rejected = expect(result).rejects.toThrow("FatalError");
    child.emit("error", "FatalError", "native", "诊断报告");
    await rejected;
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("推理超时终止进程并清空排队请求", async () => {
    const first = client.request(input("一"), "interactive");
    child.ready();
    await vi.advanceTimersByTimeAsync(0);
    const second = client.request(input("二"), "background");
    const settled = Promise.allSettled([first, second]);
    await vi.advanceTimersByTimeAsync(180_000);
    expect((await settled).map(item => item.status)).toEqual(["rejected", "rejected"]);
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("单条推理报错后仍可继续，错误请求编号不能结算当前任务", async () => {
    const first = client.request(input("一"), "interactive");
    const rejected = expect(first).rejects.toThrow("推理失败");
    child.ready();
    await vi.advanceTimersByTimeAsync(0);
    child.emit("message", { kind: "error", id: -1, message: "迟到错误" });
    const second = client.request(input("二"), "interactive");
    child.emit("message", {
      kind: "error",
      id: child.postMessage.mock.lastCall![0].id,
      message: "推理失败",
    });
    await rejected;
    await vi.advanceTimersByTimeAsync(0);
    child.complete();
    await expect(second).resolves.toMatchObject({ kind: "embed" });
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("发送异常拒绝请求，真正退出时终止进程并禁止重启", async () => {
    child.postMessage.mockImplementationOnce(() => {
      throw new Error("发送失败");
    });
    const request = client.request(input("一"), "interactive");
    const rejected = expect(request).rejects.toThrow("发送失败");
    child.ready();
    await vi.advanceTimersByTimeAsync(0);
    await rejected;
    expect(electron.once.mock.lastCall![0]).toBe("quit");
    electron.once.mock.lastCall![1]();
    await expect(client.request(input("二"), "background")).rejects.toThrow("已关闭");
  });
});
