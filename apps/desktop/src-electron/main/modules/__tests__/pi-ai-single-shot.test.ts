import http from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import PiAiRuntimeModule from "../pi-ai-runtime";
import { createProviderRegistry } from "../pi-ai-runtime-core";
import { executeSingleShot } from "../pi-ai-single-shot";
import type { UsageRecordInput } from "../model-usage/recorder";
import type { PiSingleShotRequest, LLMProviderSetting } from "@/types/pi-llm";

const ipc = vi.hoisted(() => ({ handlers: new Map<string, unknown>(), snapshot: vi.fn() }));
vi.mock("electron", () => ({
  ipcMain: { handle: (name: string, handler: unknown) => ipc.handlers.set(name, handler) },
}));
vi.mock("../user-setting", () => ({
  default: { getSettingSnapshot: ipc.snapshot, onSettingChanged: () => undefined },
}));
vi.mock("../model-usage", () => ({ default: { record: () => undefined } }));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function setup(status = 200) {
  const requests: Array<{ headers: http.IncomingHttpHeaders; body: Record<string, unknown> }> = [];
  const server = http.createServer(async (request, response) => {
    let raw = "";
    for await (const bytes of request) raw += bytes;
    requests.push({ headers: request.headers, body: JSON.parse(raw) });
    if (status !== 200) {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "MissingSessionID" } }));
      return;
    }
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(
      `data: ${JSON.stringify({
        id: "contract",
        object: "chat.completion.chunk",
        created: 0,
        choices: [{ index: 0, delta: { content: "生成完成" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
      })}\n\ndata: [DONE]\n\n`
    );
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise(resolve => {
        server.closeAllConnections();
        server.close(() => resolve());
      })
  );
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("本地网关未启动");
  const registry = createProviderRegistry();
  const setting: LLMProviderSetting = {
    id: "opencode-go",
    name: "local",
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: "test-only",
    api: "openai-completions",
    models: [
      {
        id: "local-model",
        reasoning: true,
        input: ["text"],
        contextWindow: 8192,
        maxTokens: 1024,
        cost: { input: 0, output: 0 },
        thinkingLevel: "high",
        compat: { thinkingFormat: "deepseek" },
      },
    ],
  };
  await registry.syncProviders([setting]);
  const request: PiSingleShotRequest = {
    requestId: crypto.randomUUID(),
    providerId: "opencode-go",
    modelId: "local-model",
    messages: [{ role: "user", content: "合成测试" }],
  };
  return { registry, request, requests, setting };
}

it("标题、记忆和插件共享出口，路由按任务归属稳定且审计不冒充聊天记录", async () => {
  const { registry, request, requests } = await setup();
  const records: UsageRecordInput[] = [];
  for (const source of [
    { feature: "titleSummary", library: "personal", entityId: "chat-A" },
    { feature: "titleSummary", library: "personal", entityId: "chat-A" },
    { feature: "assistantMemory", library: "personal", entityId: "extract" },
    { feature: "plugin:test", pluginId: "test-plugin" },
  ]) {
    const result = await executeSingleShot(
      registry,
      { ...request, requestId: crypto.randomUUID(), source },
      input => records.push(input)
    );
    expect(result.ok).toBe(true);
    expect(result.message?.content).toContainEqual({ type: "text", text: "生成完成" });
  }
  const routing = requests.map(request => request.headers["x-opencode-session"]);
  expect(routing[0]).toBe(routing[1]);
  expect(new Set([routing[0], routing[2], routing[3]]).size).toBe(3);
  expect(records.map(record => record.routingId)).toEqual(routing);
  expect(records.every(record => record.sessionId === null && record.status === "ok")).toBe(true);
});

it("独立单发各有路由，显式任务身份跨请求复用且任务推理档位覆盖模型默认值", async () => {
  const { registry, request, requests } = await setup();
  for (const options of [
    {},
    {},
    { task: { routingId: "logical-task" }, thinking: "off" as const },
    { task: { routingId: "logical-task" } },
  ])
    expect(
      (
        await executeSingleShot(
          registry,
          { ...request, requestId: crypto.randomUUID(), ...options },
          () => undefined
        )
      ).ok
    ).toBe(true);
  expect(requests[0].headers["x-opencode-session"]).not.toBe(
    requests[1].headers["x-opencode-session"]
  );
  expect(requests[2].headers["x-opencode-session"]).toBe(requests[3].headers["x-opencode-session"]);
  expect(requests[0].body.thinking).toEqual({ type: "enabled" });
  expect(requests[2].body.thinking).toEqual({ type: "disabled" });
});

it("流内错误返回失败并只记一次审计，保留服务商原因", async () => {
  const { registry, request, requests } = await setup(400);
  const records: UsageRecordInput[] = [];
  const result = await executeSingleShot(registry, request, record => records.push(record));
  expect(result).toMatchObject({ ok: false, aborted: false, message: null });
  expect(result.error).toContain("MissingSessionID");
  expect(requests).toHaveLength(1);
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ status: "error", sessionId: null, usageKnown: false });
  expect(records[0].errorMessage).toContain("MissingSessionID");
});

it.each([false, true])("首次 provider 同步期间的单发可等待配置并保留取消：%s", async cancelled => {
  const { request, requests, setting } = await setup();
  let ready: ((setting: { llmProviders: LLMProviderSetting[] }) => void) | undefined;
  const snapshot = new Promise<{ llmProviders: LLMProviderSetting[] }>(resolve => {
    ready = resolve;
  });
  ipc.snapshot.mockReturnValueOnce(snapshot);
  PiAiRuntimeModule.init();
  const handler = ipc.handlers.get("pi-ai:single-shot") as (
    event: { sender: { isDestroyed(): boolean; send(): void } },
    request: PiSingleShotRequest
  ) => Promise<{ ok: boolean; aborted?: boolean }>;
  const pending = handler({ sender: { isDestroyed: () => false, send: () => undefined } }, request);
  expect(requests).toHaveLength(0);
  if (cancelled) {
    const cancel = ipc.handlers.get("pi-ai:cancel") as (
      event: unknown,
      input: { requestId: string }
    ) => Promise<boolean>;
    await cancel(null, { requestId: request.requestId });
  }
  ready?.({ llmProviders: [setting] });
  expect(await pending).toMatchObject({ ok: !cancelled, aborted: cancelled });
  expect(requests).toHaveLength(cancelled ? 0 : 1);
});
