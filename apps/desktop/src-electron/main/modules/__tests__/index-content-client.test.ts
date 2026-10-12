import type { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workers: [] as Array<
    EventEmitter & { postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> }
  >,
}));
vi.mock("node:worker_threads", async () => {
  const { EventEmitter } = await import("node:events");
  class Worker extends EventEmitter {
    postMessage = vi.fn();
    terminate = vi.fn(async () => 0);
    constructor() {
      super();
      mocks.workers.push(this);
    }
  }
  return { Worker, default: { Worker } };
});
import { IndexContentClient } from "../index-content-client";

const input = { raw: "[]", title: "", whole: false, sections: true };
beforeEach(() => {
  mocks.workers.length = 0;
});

describe("正文转换线程生命周期", () => {
  it("按需启动、逐篇复用并回收", async () => {
    const client = new IndexContentClient();
    expect(mocks.workers).toHaveLength(0);
    const first = client.prepare(input);
    mocks.workers[0].emit("message", { ok: true, result: { content: "甲" } });
    expect(await first).toEqual({ content: "甲" });
    const second = client.prepare(input);
    mocks.workers[0].emit("message", { ok: true, result: { content: "乙" } });
    expect(await second).toEqual({ content: "乙" });
    expect(mocks.workers).toHaveLength(1);
    await client.dispose();
    expect(mocks.workers[0].terminate).toHaveBeenCalledOnce();
  });

  it("意外退出拒绝在途请求，后续请求也不悬挂", async () => {
    const client = new IndexContentClient();
    const result = client.prepare(input);
    mocks.workers[0].emit("exit", 1);
    await expect(result).rejects.toThrow("退出");
    await expect(client.prepare(input)).rejects.toThrow("退出");
    await client.dispose();
  });

  it("转换失败不丢失错误，并允许下一篇请求", async () => {
    const client = new IndexContentClient();
    const result = client.prepare(input);
    mocks.workers[0].emit("message", { ok: false, message: "非法正文" });
    await expect(result).rejects.toThrow("非法正文");
    const next = client.prepare(input);
    mocks.workers[0].emit("message", { ok: true, result: { content: "" } });
    await expect(next).resolves.toEqual({ content: "" });
    await client.dispose();
  });
});
