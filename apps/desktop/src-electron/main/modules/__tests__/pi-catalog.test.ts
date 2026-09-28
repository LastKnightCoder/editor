/**
 * pi 内置服务商目录查询（M3-d）：跑真实目录，不联网（allowModelNetwork: false）。
 * 目录里有 10 种 api，本运行时只支持 3 种——不受支持的服务商/模型必须不出现在选择器里，
 * 否则用户会建出跑不起来的服务商。
 */
import { describe, expect, it } from "vitest";
import {
  listCatalogModels,
  listCatalogProviders,
  lookupBuiltinModel,
  resolveThinkingLevels,
  toPiModel,
} from "../pi-ai-runtime-core";
import type { LLMProviderSetting } from "@/types/pi-llm";

// jsdom 环境的 AbortSignal 缺 any()（Node 24 / Electron 主进程原生可用）；ModelRuntime.create 依赖它
if (typeof AbortSignal.any !== "function") {
  Object.assign(AbortSignal, {
    any(signals: AbortSignal[]): AbortSignal {
      const controller = new AbortController();
      for (const signal of signals) {
        if (signal.aborted) {
          controller.abort(signal.reason);
          break;
        }
        signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
      }
      return controller.signal;
    },
  });
}

const SUPPORTED = ["openai-completions", "openai-responses", "anthropic-messages"];

describe("pi 内置服务商目录", () => {
  it("只列出受支持线协议的服务商，带 api 兜底与模型数", async () => {
    const providers = await listCatalogProviders();
    expect(providers.length).toBeGreaterThan(10);
    for (const provider of providers) {
      expect(SUPPORTED).toContain(provider.api);
      expect(provider.modelCount).toBeGreaterThan(0);
      expect(provider.name).toBeTruthy();
    }
    // 按展示名排序，界面不需要再排
    expect(providers.map(p => p.name)).toEqual(
      [...providers.map(p => p.name)].sort((a, b) => a.localeCompare(b))
    );
    // api 不受支持的服务商（Google/Bedrock/Vertex 等）必须缺席
    const ids = providers.map(p => p.id);
    expect(ids).toContain("anthropic");
    expect(ids).toContain("openai");
    expect(ids).not.toContain("google");
    expect(ids).not.toContain("amazon-bedrock");
  });

  it("模型元数据可直接带入设置，免手填上下文窗口/能力", async () => {
    const models = await listCatalogModels("anthropic");
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(SUPPORTED).toContain(model.api);
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(model.maxTokens).toBeGreaterThan(0);
      expect(model.input).toContain("text");
    }
    const opus = models.find(model => model.id.startsWith("claude-opus"));
    expect(opus).toMatchObject({ api: "anthropic-messages", reasoning: true });
    expect(opus!.contextWindow).toBeGreaterThanOrEqual(200_000);
    // 推理模型带真实档位（Anthropic 可关思考，故含 off）
    expect(opus!.thinkingLevels).toContain("off");
    expect(opus!.thinkingLevels).toContain("high");
  });

  it("混合 api 的服务商里每个模型各自带 api", async () => {
    const models = await listCatalogModels("openrouter");
    const apis = new Set(models.map(model => model.api));
    expect(apis.size).toBeGreaterThan(1);
    for (const api of apis) expect(SUPPORTED).toContain(api);
  });

  it("不存在的服务商返回空列表而不是抛错", async () => {
    expect(await listCatalogModels("not-a-provider")).toEqual([]);
  });

  it("推理档位：目录命中用 pi 判定（gpt-5 不可关思考），未命中给通用档", async () => {
    const openai: LLMProviderSetting = {
      id: "p1",
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      api: "openai-responses",
      models: [{ id: "gpt-5", reasoning: true, input: ["text"] }],
    };
    const hit = await resolveThinkingLevels(openai, "gpt-5");
    expect(hit.fromCatalog).toBe(true);
    expect(hit.levels).toContain("high");
    expect(hit.levels).not.toContain("off");

    const custom: LLMProviderSetting = {
      ...openai,
      baseUrl: "http://localhost:11434/v1",
      models: [
        { id: "my-reasoner", reasoning: true, input: ["text"] },
        { id: "plain", reasoning: false, input: ["text"] },
      ],
    };
    expect(await resolveThinkingLevels(custom, "my-reasoner")).toEqual({
      levels: ["off", "low", "medium", "high"],
      fromCatalog: false,
    });
    expect(await resolveThinkingLevels(custom, "plain")).toEqual({
      levels: [],
      fromCatalog: false,
    });
  });

  it("端到端：目录勾选的服务商+模型在主进程命中目录，元数据以目录为准", async () => {
    const providers = await listCatalogProviders();
    const anthropic = providers.find(item => item.id === "anthropic")!;
    const models = await listCatalogModels("anthropic");
    const picked = models.find(model => model.id.startsWith("claude-opus"))!;

    // 设置页勾选后写入的形状：builtin + 目录带出的元数据
    const setting: LLMProviderSetting = {
      id: "p-generated",
      name: anthropic.name,
      baseUrl: anthropic.baseUrl!,
      apiKey: "sk-test",
      api: anthropic.api,
      builtin: anthropic.id,
      models: [
        {
          id: picked.id,
          name: picked.name,
          reasoning: picked.reasoning,
          input: picked.input,
          contextWindow: picked.contextWindow,
          maxTokens: picked.maxTokens,
          api: picked.api,
        },
      ],
    };

    const base = await lookupBuiltinModel(setting.builtin!, picked.id);
    expect(base).toBeDefined();
    const resolved = toPiModel(setting.models[0], setting, base);
    expect(resolved).toMatchObject({
      api: "anthropic-messages",
      provider: "p-generated",
      baseUrl: anthropic.baseUrl,
      reasoning: true,
    });
    // 目录值权威：上下文窗口/最大输出不再是瞎猜的 128k/8192
    expect(resolved.contextWindow).toBe(base!.contextWindow);
    expect(resolved.maxTokens).toBe(base!.maxTokens);
    expect(resolved.contextWindow).not.toBe(128_000);
    expect((await resolveThinkingLevels(setting, picked.id)).fromCatalog).toBe(true);
  });

  it("模型自带 api 兜底混合服务商（目录缺席时不落到错误协议）", () => {
    const provider: LLMProviderSetting = {
      id: "p1",
      name: "网关",
      baseUrl: "https://gateway.example/v1",
      apiKey: "",
      api: "openai-completions",
      models: [],
    };
    expect(() => toPiModel({ id: "unknown", reasoning: false, input: ["text"] }, provider)).toThrow(
      "容量"
    );
    expect(
      toPiModel(
        {
          id: "claude",
          reasoning: true,
          input: ["text"],
          api: "anthropic-messages",
          contextWindow: 200_000,
          maxTokens: 8192,
        },
        provider
      ).api
    ).toBe("anthropic-messages");
    // 目录命中时目录权威，压过模型自带值
    expect(
      toPiModel(
        {
          id: "claude",
          reasoning: true,
          input: ["text"],
          api: "anthropic-messages",
          contextWindow: 200_000,
          maxTokens: 8192,
        },
        provider,
        {
          api: "openai-responses",
        } as never
      ).api
    ).toBe("openai-responses");
    // 都没有则落服务商级
    expect(
      toPiModel(
        { id: "x", reasoning: false, input: ["text"], contextWindow: 8192, maxTokens: 1024 },
        provider
      ).api
    ).toBe("openai-completions");
  });
});
