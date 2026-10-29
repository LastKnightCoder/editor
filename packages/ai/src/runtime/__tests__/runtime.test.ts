import { expect, it, vi } from "vitest";
import { AiRuntime } from "../runtime";
import { AiToolRegistry } from "../../tools";
import type { AiToolSpec } from "../../contracts";
import { projectSessionMessages } from "../../session";
import { AiError } from "../../contracts";
import {
  deferred,
  encodeTurn,
  historyDocument,
  memoryStore,
  network,
  request,
  resolved,
  session,
} from "./fixtures";

const toolSpec = (risk: AiToolSpec["risk"] = "read"): AiToolSpec => ({
  id: "cards:read",
  name: "read_card",
  description: "读取卡片",
  inputSchema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
  risk,
  sourceId: "cards",
  executionIdentity: "cards:1",
});

it("用户消息持久化确认后才返回接受，首轮问题不等待模型回答", async () => {
  const persisted = deferred<void>();
  const entered = deferred<void>();
  const store = memoryStore({
    beforeAppend: async entries => {
      if (entries.some(entry => entry.message?.role === "user")) {
        entered.resolve();
        await persisted.promise;
      }
    },
  });
  const api = network([{ text: "回答" }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => resolved(api.fetch),
  });
  let accepted = false;
  const start = runtime.start(request(store.read().revision)).then(handle => {
    accepted = true;
    return handle;
  });
  await entered.promise;
  expect(accepted).toBe(false);
  expect(api.requests).toHaveLength(0);
  persisted.resolve();
  const handle = await start;
  expect(store.read().document.entries.some(entry => entry.message?.role === "user")).toBe(true);
  expect((await handle.result).outcome).toBe("completed");
});

it("工具意图先落盘才执行，结果先落盘才开始下一轮，历史按同一消息协议投影", async () => {
  const store = memoryStore();
  const tools = new AiToolRegistry();
  const execute = vi.fn(async () => {
    const entries = store.read().document.entries;
    expect(JSON.stringify(entries)).toContain('"type":"toolCall"');
    expect(entries.some(entry => entry.message?.role === "toolResult")).toBe(false);
    return { content: "卡片正文", metadata: { render: { version: 1, data: { title: "卡片" } } } };
  });
  tools.register(toolSpec(), execute);
  const api = network([{ tool: "read_card", args: { id: 1 } }, { text: "已读取卡片。" }], index => {
    if (index === 1)
      expect(
        store.read().document.entries.some(entry => entry.message?.role === "toolResult")
      ).toBe(true);
  });
  const runtime = new AiRuntime({
    store: store.store,
    tools,
    resolveModel: async () => resolved(api.fetch),
  });
  const handle = await runtime.start(request(store.read().revision, { toolIds: ["cards:read"] }));
  const result = await handle.result;
  expect(result.outcome).toBe("completed");
  expect(execute).toHaveBeenCalledOnce();
  expect(api.requests).toHaveLength(2);
  expect(result.messages).toEqual(projectSessionMessages(store.read().document));
  const assistant = result.messages.find(message => message.role === "assistant");
  expect(assistant).toMatchObject({
    content: "已读取卡片。",
    assistant_blocks: expect.arrayContaining([
      expect.objectContaining({
        type: "tool_call",
        execution: expect.objectContaining({ status: "success", output: "卡片正文" }),
      }),
    ]),
  });
  expect(store.releases()).toBe(1);
});

it("使用持久会话真实上下文续聊，保留之前的用户与模型消息", async () => {
  const store = memoryStore({ document: historyDocument() });
  const api = network([{ text: "继续回答" }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => resolved(api.fetch),
  });
  const result = await (await runtime.start(request(store.read().revision))).result;
  expect(JSON.stringify(api.requests[0])).toContain("上次的问题");
  expect(JSON.stringify(api.requests[0])).toContain("上次的回答");
  expect(result.messages.filter(message => message.role === "user")).toHaveLength(2);
});

it("相同 runId 幂等，同会话并发运行被拒绝", async () => {
  const ready = deferred<void>();
  const controller = deferred<Response>();
  const fetch: typeof globalThis.fetch = async () => {
    ready.resolve();
    return controller.promise;
  };
  const store = memoryStore();
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => resolved(fetch),
  });
  const input = request(store.read().revision);
  const handle = await runtime.start(input);
  await ready.promise;
  const duplicate = await runtime.start(input);
  expect(duplicate.result).toBe(handle.result);
  await expect(
    runtime.start({ ...input, runId: "validation-run-2", expectedRevision: store.read().revision })
  ).rejects.toMatchObject({ code: "AI_SESSION_BUSY" });
  controller.resolve(
    new Response(encodeTurn({ text: "完成" }), { headers: { "content-type": "text/event-stream" } })
  );
  await handle.result;
  expect(
    store.read().document.entries.filter(entry => entry.message?.role === "user")
  ).toHaveLength(1);
});

it("无 UI 入口拒绝写工具，并将拒绝结果交回模型而不执行", async () => {
  const store = memoryStore();
  const tools = new AiToolRegistry();
  const execute = vi.fn(async () => ({ content: "不应执行" }));
  tools.register(toolSpec("write"), execute);
  const api = network([{ tool: "read_card", args: { id: 1 } }, { text: "当前入口不能确认修改。" }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools,
    resolveModel: async () => resolved(api.fetch),
  });
  const result = await (
    await runtime.start(request(store.read().revision, { toolIds: ["cards:read"] }))
  ).result;
  expect(execute).not.toHaveBeenCalled();
  expect(store.read().document.entries).toContainEqual(
    expect.objectContaining({
      type: "message",
      message: expect.objectContaining({ role: "toolResult", isError: true }),
    })
  );
  expect(result.outcome).toBe("completed");
});

it("有明确审批宿主才允许执行，审批等待状态可以观察", async () => {
  const store = memoryStore();
  const tools = new AiToolRegistry();
  const execute = vi.fn(async () => ({ content: "修改已完成" }));
  tools.register(toolSpec("write"), execute);
  const api = network([{ tool: "read_card", args: { id: 1 } }, { text: "完成" }]);
  const approval = deferred<"allow">();
  const entered = deferred<void>();
  const runtime = new AiRuntime({
    store: store.store,
    tools,
    resolveModel: async () => resolved(api.fetch),
    approve: async () => {
      entered.resolve();
      return approval.promise;
    },
  });
  const input = request(store.read().revision, {
    toolIds: ["cards:read"],
    interactionMode: "host",
  });
  const handle = await runtime.start(input);
  await entered.promise;
  expect(runtime.getSnapshot(input.runId)?.status).toBe("waiting-approval");
  expect(execute).not.toHaveBeenCalled();
  approval.resolve("allow");
  expect((await handle.result).outcome).toBe("completed");
  expect(execute).toHaveBeenCalledOnce();
});

it("assistant 工具意图落盘失败时不执行工具，最终消息只含已提交内容", async () => {
  const store = memoryStore({
    rejectAppend: entries => entries.some(entry => entry.message?.role === "assistant"),
  });
  const tools = new AiToolRegistry();
  const execute = vi.fn(async () => ({ content: "不应执行" }));
  tools.register(toolSpec(), execute);
  const api = network([{ tool: "read_card", args: { id: 1 } }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools,
    resolveModel: async () => resolved(api.fetch),
  });
  const result = await (
    await runtime.start(request(store.read().revision, { toolIds: ["cards:read"] }))
  ).result;
  expect(result.outcome).toBe("failed");
  expect(result.error?.code).toBe("AI_STORAGE_FAILED");
  expect(execute).not.toHaveBeenCalled();
  expect(result.messages).toEqual(projectSessionMessages(store.read().document));
  expect(result.messages.some(message => message.role === "assistant")).toBe(false);
});

it("工具结果落盘失败时不启动依赖它的下一轮模型请求", async () => {
  const store = memoryStore({
    rejectAppend: entries => entries.some(entry => entry.message?.role === "toolResult"),
  });
  const tools = new AiToolRegistry();
  const execute = vi.fn(async () => ({ content: "读取完成" }));
  tools.register(toolSpec(), execute);
  const api = network([{ tool: "read_card", args: { id: 1 } }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools,
    resolveModel: async () => resolved(api.fetch),
  });
  const result = await (
    await runtime.start(request(store.read().revision, { toolIds: ["cards:read"] }))
  ).result;
  expect(execute).toHaveBeenCalledOnce();
  expect(api.requests).toHaveLength(1);
  expect(result.outcome).toBe("failed");
  expect(result.error?.code).toBe("AI_STORAGE_FAILED");
});

it("模型鉴权失败仍保留首条用户问题，失败的模型收尾记录不是成功回答", async () => {
  const store = memoryStore();
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: { message: "凭据无效" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })
  );
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => resolved(fetch),
  });
  const result = await (await runtime.start(request(store.read().revision))).result;
  expect(fetch).toHaveBeenCalledOnce();
  expect(result.outcome).toBe("failed");
  expect(result.messages).toHaveLength(1);
  expect(result.messages[0].role).toBe("user");
  expect(store.read().document.entries).toContainEqual(
    expect.objectContaining({
      type: "message",
      message: expect.objectContaining({ role: "assistant", stopReason: "error" }),
    })
  );
});

it("释放库会取消模型流并等待最终收尾，释放订阅不会代替取消", async () => {
  const store = memoryStore();
  const ready = deferred<void>();
  let cancelled = false;
  const dispose = vi.fn(async () => undefined);
  const fetch: typeof globalThis.fetch = async (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => {
          cancelled = true;
          reject(new DOMException("取消", "AbortError"));
        },
        { once: true }
      );
      ready.resolve();
    });
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => resolved(fetch, dispose),
  });
  const input = request(store.read().revision);
  const notifications: string[] = [];
  const unsubscribe = runtime.subscribe(input.runId, event => {
    notifications.push(event.event.type);
  });
  const handle = await runtime.start(input);
  await ready.promise;
  unsubscribe();
  expect(cancelled).toBe(false);
  await runtime.releaseLibrary(session.databaseName);
  expect(cancelled).toBe(true);
  expect((await handle.result).outcome).toBe("aborted");
  expect(dispose).toHaveBeenCalledOnce();
  expect(store.releases()).toBe(1);
  expect(runtime.getSnapshot(input.runId)?.status).toBe("settled");
});

it("恰好在轮数预算最后一轮给出正常回答不算预算失败", async () => {
  const store = memoryStore();
  const api = network([{ text: "最终回答" }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => resolved(api.fetch),
    maxTurns: 1,
  });
  const result = await (await runtime.start(request(store.read().revision))).result;
  expect(result.outcome).toBe("completed");
});

it("工具结果未知时结束本轮，不让模型立即重试已经可能提交的写入", async () => {
  const store = memoryStore();
  const tools = new AiToolRegistry();
  const execute = vi.fn(async () => {
    throw new AiError("AI_TOOL_OUTCOME_UNKNOWN", "远端回执丢失");
  });
  tools.register(toolSpec("write"), execute);
  const api = network([{ tool: "read_card", args: { id: 1 } }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools,
    resolveModel: async () => resolved(api.fetch),
    permissionMode: () => "acceptEdits",
  });
  const result = await (
    await runtime.start(request(store.read().revision, { toolIds: ["cards:read"] }))
  ).result;
  expect(result.outcome).toBe("failed");
  expect(result.error?.code).toBe("AI_TOOL_OUTCOME_UNKNOWN");
  expect(execute).toHaveBeenCalledOnce();
  expect(api.requests).toHaveLength(1);
});

it("重开悬挂工具会补结果未知记录，但不会自动执行原来的工具", async () => {
  const document = historyDocument();
  const assistant = document.entries.at(-1);
  if (!assistant) throw new Error("历史夹具缺少助手消息");
  assistant.message = {
    ...assistant.message,
    role: "assistant",
    stopReason: "toolUse",
    content: [
      { type: "toolCall", id: "interrupted-call", name: "read_card", arguments: { id: 1 } },
    ],
  };
  const store = memoryStore({ document });
  const tools = new AiToolRegistry();
  const execute = vi.fn(async () => ({ content: "不能重放" }));
  tools.register(toolSpec(), execute);
  const api = network([{ text: "上次修改结果需要重新核对。" }]);
  const runtime = new AiRuntime({
    store: store.store,
    tools,
    resolveModel: async () => resolved(api.fetch),
  });
  const result = await (
    await runtime.start(request(store.read().revision, { toolIds: ["cards:read"] }))
  ).result;
  expect(execute).not.toHaveBeenCalled();
  expect(store.read().document.entries).toContainEqual(
    expect.objectContaining({
      type: "message",
      message: expect.objectContaining({
        role: "toolResult",
        toolCallId: "interrupted-call",
        isError: true,
        details: { outcomeUnknown: true },
      }),
    })
  );
  expect(JSON.stringify(api.requests[0])).toContain("不可自动重放");
  expect(result.outcome).toBe("completed");
});

it("直播部分文本使用streaming块，落盘后身份和正文保持一致", async () => {
  const store = memoryStore();
  const partial = deferred<void>();
  const remaining = deferred<void>();
  const text = encodeTurn({ text: "流式中文回答" });
  const boundary = text.indexOf(
    'data: {"id":"validation-chat"',
    text.indexOf('"content":"流式中文回答"')
  );
  expect(boundary).toBeGreaterThan(0);
  const fetch: typeof globalThis.fetch = async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode(text.slice(0, boundary)));
          await remaining.promise;
          controller.enqueue(new TextEncoder().encode(text.slice(boundary)));
          controller.close();
        },
      }),
      { headers: { "content-type": "text/event-stream" } }
    );
  const runtime = new AiRuntime({
    store: store.store,
    tools: new AiToolRegistry(),
    resolveModel: async () => resolved(fetch),
  });
  const input = request(store.read().revision);
  let liveAssistant: ReturnType<typeof runtime.getSnapshot>;
  const stop = runtime.subscribe(input.runId, event => {
    if (
      event.event.type === "snapshot" &&
      event.event.snapshot.status === "running" &&
      event.event.snapshot.messages.some(
        message => message.role === "assistant" && message.content === "流式中文回答"
      )
    ) {
      liveAssistant = event.event.snapshot;
      partial.resolve();
    }
  });
  const handle = await runtime.start(input);
  await partial.promise;
  const live = liveAssistant?.messages.find(message => message.role === "assistant");
  expect(live).toMatchObject({
    assistant_blocks: [expect.objectContaining({ type: "text", state: "streaming" })],
  });
  expect(store.read().document.entries.some(entry => entry.message?.role === "assistant")).toBe(
    false
  );
  remaining.resolve();
  const result = await handle.result;
  stop();
  const final = result.messages.find(message => message.role === "assistant");
  expect(final).toMatchObject({
    content: "流式中文回答",
    assistant_blocks: [expect.objectContaining({ type: "text", state: "final" })],
  });
  expect(final?.piEntryIds).toEqual(live?.piEntryIds);
});
