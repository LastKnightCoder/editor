import { expect, it, vi } from "vitest";
import type { ResponseMessage } from "@tau/shared/chat-core";
import { AiRuntime } from "../runtime";
import { AiError } from "../../contracts";
import { AiToolRegistry } from "../../tools";
import { deferred, memoryStore, model, network, resolved, session } from "./fixtures";

const request = (id = "generation-1") => ({
  requestId: id,
  databaseName: session.databaseName,
  model: { providerId: "validation", modelId: model.id },
  system: "只使用中文回答。",
  messages: [{ role: "user" as const, content: "总结正文" }],
  thinkingLevel: "off" as const,
});

it("单发保留system并输出中立的流式/最终消息，不创建持久会话", async () => {
  const store = memoryStore();
  const begin = vi.spyOn(store.store, "beginRun");
  const api = network([{ text: "中文总结" }]);
  const snapshots: ResponseMessage[] = [];
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => resolved(api.fetch),
  });
  const handle = await runtime.generate(request(), response => {
    snapshots.push(response);
  });
  const result = await handle.result;
  expect(result.outcome).toBe("completed");
  expect(JSON.stringify(api.requests[0])).toContain("只使用中文回答。");
  expect(result.response).toMatchObject({ role: "assistant", content: "中文总结" });
  expect(result).not.toHaveProperty("message");
  expect(result.response).not.toHaveProperty("api");
  expect(
    snapshots.some(response =>
      response.assistant_blocks?.some(block => block.state === "streaming")
    )
  ).toBe(true);
  expect(result.response?.assistant_blocks?.every(block => block.state === "final")).toBe(true);
  expect(store.read().document.entries).toHaveLength(0);
  expect(begin).toHaveBeenCalledWith(
    { databaseName: session.databaseName, sessionId: "generation-1" },
    "generation-1"
  );
  expect(store.releases()).toBe(1);
});

it("模型配置解析失败通过单发结果返回failed，仍释放维护占用", async () => {
  const store = memoryStore();
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => {
      throw new AiError("AI_MODEL_UNAVAILABLE", "模型未配置");
    },
  });
  const result = await (await runtime.generate(request())).result;
  expect(result).toMatchObject({
    outcome: "failed",
    response: null,
    error: { code: "AI_MODEL_UNAVAILABLE" },
  });
  expect(store.read().document.entries).toHaveLength(0);
  expect(store.releases()).toBe(1);
});

it.each(["releaseLibrary", "dispose"] as const)(
  "%s 会取消单发且等待传输与租约清理完成",
  async method => {
    const store = memoryStore();
    const started = deferred<void>();
    const cleanupStarted = deferred<void>();
    const cleanupReady = deferred<void>();
    let aborted = false;
    const fetch: typeof globalThis.fetch = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new DOMException("停止", "AbortError"));
          },
          { once: true }
        );
        started.resolve();
      });
    const runtime = new AiRuntime({
      store: store.store,
      tools: new AiToolRegistry(),
      resolveModel: async () =>
        resolved(fetch, async () => {
          cleanupStarted.resolve();
          await cleanupReady.promise;
        }),
    });
    const handle = await runtime.generate(request());
    await started.promise;
    let released = false;
    const release = (
      method === "dispose" ? runtime.dispose() : runtime.releaseLibrary(session.databaseName)
    ).then(() => {
      released = true;
    });
    await cleanupStarted.promise;
    expect(aborted).toBe(true);
    expect(released).toBe(false);
    cleanupReady.resolve();
    await release;
    expect((await handle.result).outcome).toBe("aborted");
    expect(store.releases()).toBe(1);
  }
);
