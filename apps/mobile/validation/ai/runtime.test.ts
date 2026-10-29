import { expect, it, vi, afterEach } from "vitest";
import { createValidationAgent, createValidationTools, type ValidationApi } from "./runtime";
import {
  cardFixture,
  cardTurns,
  documentFixture,
  memoryCommands,
  scriptedFetch,
  searchFixture,
} from "./fixtures";
import * as commands from "../../src/services/tauri";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("../../src/utils/perf", () => ({ logPerf: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it.each<ValidationApi>(["openai-completions", "openai-responses", "anthropic-messages"])(
  "%s 经真实 SDK 解析分片 SSE，完成技能、搜索、读取、编辑五轮循环",
  async api => {
    const host = memoryCommands();
    const network = scriptedFetch(api, cardTurns);
    const agent = createValidationAgent({
      api,
      fetch: network.fetch,
      tools: createValidationTools(host.commands),
    });
    const events: string[] = [];
    agent.subscribe(event => {
      events.push(event.type);
    });
    await agent.prompt("整理会议卡片的行动项");
    expect(agent.state.errorMessage).toBeUndefined();
    expect(network.requests).toHaveLength(5);
    expect(host.writes).toHaveLength(1);
    expect(host.writes[0]).toMatchObject({
      expectedRevision: "revision-1",
      expectedDocumentId: "local-document-101",
      expectedSourceId: "validation-library",
    });
    expect(JSON.stringify(host.writes[0].content)).toContain("行动项：周五提交方案");
    expect(JSON.stringify(network.requests[1])).toContain("先搜索并读取卡片");
    expect(JSON.stringify(network.requests[4])).toContain("saved");
    expect(events.filter(type => type === "tool_execution_end")).toHaveLength(4);
    expect(events.at(-1)).toBe("agent_end");
    expect(agent.state.isStreaming).toBe(false);
    expect(agent.state.pendingToolCalls.size).toBe(0);
  }
);

it("接入现有移动卡片命令，IPC 保存携带版本身份并重算字数", async () => {
  invoke.mockImplementation(async (name, args) => {
    switch (name) {
      case "get_cards_overview":
        return structuredClone(searchFixture);
      case "get_card_detail":
        return structuredClone(cardFixture);
      case "get_content_detail":
        return structuredClone(documentFixture);
      case "update_content":
        return { ...documentFixture, ...args.payload };
      default:
        throw new Error(`出现预期外的原生命令：${name}`);
    }
  });
  const network = scriptedFetch("openai-completions", cardTurns);
  const agent = createValidationAgent({
    api: "openai-completions",
    fetch: network.fetch,
    tools: createValidationTools(commands),
  });
  await agent.prompt("整理卡片");
  expect(agent.state.errorMessage).toBeUndefined();
  expect(invoke.mock.calls.map(([name]) => name)).toEqual([
    "get_cards_overview",
    "get_card_detail",
    "get_content_detail",
    "update_content",
  ]);
  expect(invoke).toHaveBeenLastCalledWith("update_content", {
    payload: expect.objectContaining({
      contentId: 101,
      expectedRevision: "revision-1",
      expectedDocumentId: "local-document-101",
      expectedSourceId: "validation-library",
      count: expect.any(Number),
    }),
  });
  expect(invoke.mock.calls.at(-1)?.[1].payload.count).toBeGreaterThan(4);
});

it("工具参数不合法时拒绝执行并把错误交回模型", async () => {
  const host = memoryCommands();
  const read = vi.spyOn(host.commands, "getCardDetail");
  const network = scriptedFetch("openai-completions", [
    { name: "read_card", args: { id: "错误编号" } },
    { text: "参数无效。" },
  ]);
  const agent = createValidationAgent({
    api: "openai-completions",
    fetch: network.fetch,
    tools: createValidationTools(host.commands),
  });
  await agent.prompt("读取卡片");
  expect(read).not.toHaveBeenCalled();
  expect(agent.state.messages).toContainEqual(
    expect.objectContaining({ role: "toolResult", isError: true })
  );
  expect(network.requests).toHaveLength(2);
});

it("权限钩子能在写工具执行前拦截", async () => {
  const host = memoryCommands();
  const network = scriptedFetch("openai-completions", cardTurns);
  const agent = createValidationAgent({
    api: "openai-completions",
    fetch: network.fetch,
    tools: createValidationTools(host.commands),
    beforeToolCall: async ({ toolCall }) =>
      toolCall.name === "edit_card" ? { block: true, reason: "用户拒绝修改" } : undefined,
  });
  await agent.prompt("整理卡片");
  expect(host.writes).toHaveLength(0);
  expect(JSON.stringify(network.requests.at(-1))).toContain("用户拒绝修改");
});

it("未读取卡片时不允许写入", async () => {
  const host = memoryCommands();
  const network = scriptedFetch("openai-completions", [
    { name: "edit_card", args: { id: 1, text: "不应保存" } },
    { text: "需要先读取卡片。" },
  ]);
  const agent = createValidationAgent({
    api: "openai-completions",
    fetch: network.fetch,
    tools: createValidationTools(host.commands),
  });
  await agent.prompt("编辑卡片");
  expect(host.writes).toHaveLength(0);
  expect(agent.state.messages).toContainEqual(
    expect.objectContaining({ role: "toolResult", isError: true })
  );
});

it("原生命令的版本冲突按工具错误返回，不伪装为保存成功", async () => {
  const host = memoryCommands();
  host.commands.updateContent = vi.fn().mockRejectedValue(new Error("CONTENT_CONFLICT"));
  const network = scriptedFetch("openai-completions", cardTurns);
  const agent = createValidationAgent({
    api: "openai-completions",
    fetch: network.fetch,
    tools: createValidationTools(host.commands),
  });
  await agent.prompt("整理卡片");
  expect(agent.state.messages).toContainEqual(
    expect.objectContaining({ role: "toolResult", toolName: "edit_card", isError: true })
  );
  expect(JSON.stringify(network.requests.at(-1))).toContain("CONTENT_CONFLICT");
  expect(JSON.stringify(network.requests.at(-1))).not.toContain('\\"saved\\":true');
});

it("网络请求被取消后结束忙态与工具等待", async () => {
  let started!: () => void;
  const ready = new Promise<void>(resolve => {
    started = resolve;
  });
  let aborted = false;
  const fetch: typeof globalThis.fetch = async (_input, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener(
        "abort",
        () => {
          aborted = true;
          reject(new DOMException("取消", "AbortError"));
        },
        { once: true }
      );
      started();
    });
  const agent = createValidationAgent({ api: "openai-completions", fetch });
  const run = agent.prompt("等待回复");
  await ready;
  agent.abort();
  await run;
  await agent.waitForIdle();
  expect(aborted).toBe(true);
  expect(agent.state.isStreaming).toBe(false);
  expect(agent.state.pendingToolCalls.size).toBe(0);
  expect(agent.state.messages).toContainEqual(
    expect.objectContaining({ role: "assistant", stopReason: "aborted" })
  );
});

it("本机工具收到取消信号后不开始下一轮模型请求", async () => {
  const host = memoryCommands();
  let started!: () => void;
  const ready = new Promise<void>(resolve => {
    started = resolve;
  });
  const tools = createValidationTools(host.commands);
  tools[0].execute = async (_id, _args, signal) =>
    new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new Error("工具已取消")), { once: true });
      started();
    });
  const network = scriptedFetch("openai-completions", [
    { name: "search_cards", args: { query: "会议" } },
  ]);
  const agent = createValidationAgent({ api: "openai-completions", fetch: network.fetch, tools });
  const run = agent.prompt("查找卡片");
  await ready;
  agent.abort();
  await run;
  expect(network.requests).toHaveLength(1);
  expect(agent.state.isStreaming).toBe(false);
  expect(agent.state.pendingToolCalls.size).toBe(0);
});

it("收到部分文本后可取消流式响应", async () => {
  let aborted = false;
  const fetch: typeof globalThis.fetch = async (_input, init) =>
    new Response(
      new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              controller.error(new DOMException("取消收流", "AbortError"));
            },
            { once: true }
          );
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({
                id: "stream-1",
                object: "chat.completion.chunk",
                created: 1,
                model: "validation-model",
                choices: [
                  {
                    index: 0,
                    delta: { role: "assistant", content: "部分回复" },
                    finish_reason: null,
                  },
                ],
              })}\n\n`
            )
          );
        },
      }),
      { headers: { "content-type": "text/event-stream" } }
    );
  const agent = createValidationAgent({ api: "openai-completions", fetch });
  agent.subscribe(event => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta")
      agent.abort();
  });
  await agent.prompt("开始回复");
  expect(aborted).toBe(true);
  expect(agent.state.isStreaming).toBe(false);
  expect(agent.state.messages).toContainEqual(
    expect.objectContaining({ role: "assistant", stopReason: "aborted" })
  );
});

it("HTTP 401 作为模型错误结束，不执行本机工具", async () => {
  const host = memoryCommands();
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: { message: "验证凭据无效" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })
  );
  const agent = createValidationAgent({
    api: "openai-completions",
    fetch,
    tools: createValidationTools(host.commands),
  });
  await agent.prompt("整理卡片");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(agent.state.errorMessage).toContain("401");
  expect(host.writes).toHaveLength(0);
  expect(agent.state.isStreaming).toBe(false);
});
