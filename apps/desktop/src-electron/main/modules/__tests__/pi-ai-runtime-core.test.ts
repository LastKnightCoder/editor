/**
 * pi-ai-runtime-core 验证：设置 v2 → pi Provider 的桥接 + 真实 HTTP 层流式行为。
 * 用本地 mock OpenAI 兼容网关（SSE）覆盖三块历史痛点：纯文本流、<think> 标签归一化、
 * tool_calls 参数分片重组——对应自研 adapter 时代修 bug 最多的区域。
 */
import http from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeContext, type AssistantMessageEvent } from "@earendil-works/pi-ai";
import {
  buildSingleShotContext,
  buildPiProvider,
  createProviderRegistry,
} from "../pi-ai-runtime-core";
import { rewriteThinkTagStream, type PiRewrittenEvent } from "../think-stream-rewriter";
import type { LLMProviderSetting, PiSingleShotRequest } from "@/types/pi-llm";

/** OpenAI chat-completions SSE chunk 便捷构造 */
const chunk = (delta: Record<string, unknown>, finishReason: string | null = null) => ({
  id: "chatcmpl-mock",
  object: "chat.completion.chunk",
  created: 0,
  model: "mock-model",
  choices: [{ index: 0, delta, finish_reason: finishReason }],
});

const startMockGateway = (makeChunks: (body: Record<string, any>) => unknown[]) =>
  new Promise<{ port: number; requests: Record<string, any>[]; close: () => Promise<void> }>(
    resolve => {
      const requests: Record<string, any>[] = [];
      const server = http.createServer((req, res) => {
        let raw = "";
        req.on("data", c => (raw += c));
        req.on("end", () => {
          const body = JSON.parse(raw || "{}");
          requests.push(body);
          const chunks = makeChunks(body);
          res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
          for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
        });
      });
      server.listen(0, "127.0.0.1", () => {
        resolve({
          port: (server.address() as AddressInfo).port,
          requests,
          close: () => new Promise(r => server.close(() => r())),
        });
      });
    }
  );

const runSingleShot = async (
  registry: ReturnType<typeof createProviderRegistry>,
  setting: LLMProviderSetting,
  request: Omit<PiSingleShotRequest, "requestId" | "providerId" | "modelId">
) => {
  registry.syncProviders([setting]);
  const model = registry.resolveModel(setting.id, setting.models[0].id);
  if (!model) throw new Error("model not registered");
  const events: AssistantMessageEvent[] = [];
  for await (const event of registry.models.streamSimple(
    model,
    normalizeContext(
      buildSingleShotContext(
        {
          requestId: "test",
          providerId: setting.id,
          modelId: setting.models[0].id,
          ...request,
        },
        setting.id,
        setting.models[0].id
      )
    )
  )) {
    events.push(event);
  }
  return events;
};

const textOf = (events: AssistantMessageEvent[]) => {
  const done = events.find(e => e.type === "done");
  if (done?.type !== "done") return null;
  return done.message.content
    .filter(c => c.type === "text")
    .map(c => (c as { text: string }).text)
    .join("");
};

describe("pi-ai-runtime-core", () => {
  it("buildPiProvider：模型元数据按 v2 设置落位", () => {
    const provider = buildPiProvider({
      id: "gw",
      name: "网关",
      baseUrl: "https://gw.example.com/v1",
      apiKey: "sk-1",
      api: "openai-completions",
      models: [
        {
          id: "m-1",
          reasoning: true,
          input: ["text", "image"],
          contextWindow: 65536,
          maxTokens: 8192,
          samplingParams: { temperature: 0.5 },
          headers: { "User-Agent": "Tau/1.0" },
          compat: { thinkingFormat: "deepseek" },
        },
      ],
    });
    expect(provider.id).toBe("gw");
    const model = provider.getModels()[0];
    expect(model).toMatchObject({
      id: "m-1",
      api: "openai-completions",
      provider: "gw",
      baseUrl: "https://gw.example.com/v1",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 65536,
      maxTokens: 8192,
    });
    expect(model.samplingParams).toEqual({ temperature: 0.5 });
    expect(model.headers).toEqual({ "User-Agent": "Tau/1.0" });
  });

  it("注册表：新增/变更 upsert、移除 delete、未变更跳过", () => {
    const registry = createProviderRegistry();
    const setting: LLMProviderSetting = {
      id: "a",
      name: "a",
      baseUrl: "https://a.example.com/v1",
      apiKey: "",
      api: "openai-completions",
      models: [
        { id: "m", reasoning: false, input: ["text"], contextWindow: 8192, maxTokens: 1024 },
      ],
    };
    registry.syncProviders([setting]);
    expect(registry.resolveModel("a", "m")).toBeTruthy();

    registry.syncProviders([]);
    expect(registry.resolveModel("a", "m")).toBeUndefined();

    registry.syncProviders([{ ...setting, apiKey: "changed" }]);
    expect(registry.resolveModel("a", "m")).toBeTruthy();
  });

  describe("真实 SSE 流（mock OpenAI 兼容网关）", () => {
    let gateway: Awaited<ReturnType<typeof startMockGateway>>;
    const settingOf = (overrides: Partial<LLMProviderSetting> = {}): LLMProviderSetting => ({
      id: "mock-gw",
      name: "mock",
      baseUrl: "",
      apiKey: "sk-mock",
      api: "openai-completions",
      models: [
        {
          id: "mock-model",
          reasoning: false,
          input: ["text"],
          contextWindow: 8192,
          maxTokens: 1024,
        },
      ],
      ...overrides,
    });

    beforeAll(async () => {
      gateway = await startMockGateway(() => [
        chunk({ role: "assistant" }),
        chunk({ content: "你好" }),
        chunk({ content: "，世界" }),
        chunk({}, "stop"),
      ]);
    });
    afterAll(async () => {
      await gateway.close();
    });

    it("纯文本流：delta 序列 → done 携带完整 message，请求体携带 system 与 messages", async () => {
      const registry = createProviderRegistry();
      const setting = settingOf({ baseUrl: `http://127.0.0.1:${gateway.port}/v1` });
      const events = await runSingleShot(registry, setting, {
        system: "你是测试助手",
        messages: [{ role: "user", content: "打个招呼" }],
      });

      expect(events.map(e => e.type)).toEqual(
        expect.arrayContaining(["start", "text_start", "text_delta", "text_end", "done"])
      );
      expect(textOf(events)).toBe("你好，世界");

      const body = gateway.requests[gateway.requests.length - 1];
      expect(body.model).toBe("mock-model");
      expect(body.messages[0]).toMatchObject({ role: "system", content: "你是测试助手" });
      expect(body.messages.at(-1)).toMatchObject({ role: "user", content: "打个招呼" });
    });

    // pi 原生不剥 <think>（thinkingFormat 仅请求侧）；开启 stripThinkTags 后经桥层重写器归一化
    it("<think> 标签经 stripThinkTags 重写器归一化为 thinking 事件，不混入正文", async () => {
      const thinkGateway = await startMockGateway(() => [
        chunk({ role: "assistant" }),
        chunk({ content: "<think>先推理" }),
        chunk({ content: "一下</think>" }),
        chunk({ content: "正文回答" }),
        chunk({}, "stop"),
      ]);
      try {
        const registry = createProviderRegistry();
        const setting = settingOf({
          baseUrl: `http://127.0.0.1:${thinkGateway.port}/v1`,
          models: [
            {
              id: "mock-model",
              reasoning: true,
              input: ["text"],
              contextWindow: 8192,
              maxTokens: 1024,
              stripThinkTags: true,
            },
          ],
        });
        registry.syncProviders([setting]);
        expect(registry.needsThinkStrip(setting.id, setting.models[0].id)).toBe(true);
        const model = registry.resolveModel(setting.id, setting.models[0].id);
        if (!model) throw new Error("model not registered");

        const events: PiRewrittenEvent[] = [];
        for await (const event of rewriteThinkTagStream(
          registry.models.streamSimple(
            model,
            normalizeContext(
              buildSingleShotContext(
                {
                  requestId: "t",
                  providerId: setting.id,
                  modelId: setting.models[0].id,
                  messages: [{ role: "user", content: "q" }],
                },
                setting.id,
                setting.models[0].id
              )
            )
          )
        )) {
          events.push(event);
        }

        expect(events.some(e => e.type === "thinking_start" || e.type === "thinking_delta")).toBe(
          true
        );
        const done = events.find(e => e.type === "done");
        if (!done || done.type !== "done") throw new Error("done event missing");
        expect(done.message.content).toEqual([
          { type: "thinking", thinking: "先推理一下" },
          { type: "text", text: "正文回答" },
        ]);
      } finally {
        await thinkGateway.close();
      }
    });

    it("tool_calls 参数分片重组：跨 chunk 的 arguments 增量拼成完整可解析入参", async () => {
      const toolGateway = await startMockGateway(() => [
        chunk({
          role: "assistant",
          tool_calls: [
            { index: 0, id: "call_1", type: "function", function: { name: "echo", arguments: "" } },
          ],
        }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: '{"te' } }] }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: 'xt":"你好分片"}' } }] }),
        chunk({}, "tool_calls"),
      ]);
      try {
        const registry = createProviderRegistry();
        const setting = settingOf({ baseUrl: `http://127.0.0.1:${toolGateway.port}/v1` });
        const events = await runSingleShot(registry, setting, {
          messages: [{ role: "user", content: "q" }],
        });

        expect(events.some(e => e.type === "toolcall_start")).toBe(true);
        const done = events.find(e => e.type === "done");
        if (!done || done.type !== "done") throw new Error("done event missing");
        expect(done.reason).toBe("toolUse");
        const toolCall = done.message.content.find(c => c.type === "toolCall");
        expect(toolCall).toBeTruthy();
        expect(JSON.stringify(toolCall)).toContain("你好分片");
      } finally {
        await toolGateway.close();
      }
    });
  });
});
