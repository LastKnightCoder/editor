/**
 * 服务商模型实时发现（M3-f）：本地 mock 服务覆盖 OpenAI 兼容 / Ollama 原生 / Anthropic 分页三种形状，
 * 以及目录命中时元数据以目录为准、未命中时只取服务自报字段（不瞎猜默认值）。
 */
import http from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { discoverProviderModels, modelsEndpoint } from "../pi-model-discovery";
import { listCatalogModels, lookupBuiltinModel } from "../pi-ai-runtime-core";
import type { LLMProviderSetting } from "@/types/pi-llm";

// jsdom 环境的 AbortSignal 缺 any()/timeout()（Node 24 / Electron 主进程原生可用）
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

interface Recorded {
  url: string;
  headers: http.IncomingHttpHeaders;
}

let closeServer: (() => Promise<void>) | null = null;

const startServer = (handler: (url: URL, res: http.ServerResponse) => void) =>
  new Promise<{ baseUrl: string; requests: Recorded[] }>(resolve => {
    const requests: Recorded[] = [];
    const server = http.createServer((req, res) => {
      requests.push({ url: req.url ?? "", headers: req.headers });
      handler(new URL(req.url ?? "/", "http://localhost"), res);
    });
    server.listen(0, "127.0.0.1", () => {
      closeServer = () => new Promise(r => server.close(() => r()));
      resolve({ baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests });
    });
  });

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const provider = (overrides: Partial<LLMProviderSetting>): LLMProviderSetting => ({
  id: "p1",
  name: "本地服务",
  baseUrl: "",
  apiKey: "",
  api: "openai-completions",
  models: [],
  ...overrides,
});

afterEach(async () => {
  await closeServer?.();
  closeServer = null;
});

describe("模型列表地址", () => {
  it("OpenAI 系在 baseUrl 后直接拼 /models；Anthropic 补 /v1", () => {
    expect(modelsEndpoint(provider({ baseUrl: "http://h:11434/v1/" }))).toBe(
      "http://h:11434/v1/models"
    );
    expect(
      modelsEndpoint(provider({ baseUrl: "https://api.anthropic.com", api: "anthropic-messages" }))
    ).toBe("https://api.anthropic.com/v1/models");
    expect(
      modelsEndpoint(provider({ baseUrl: "https://gw.example/v1", api: "anthropic-messages" }))
    ).toBe("https://gw.example/v1/models");
  });
});

describe("服务商模型发现", () => {
  it("OpenAI 兼容：带 Bearer，去重排序，未知字段留空不猜默认值", async () => {
    const { baseUrl, requests } = await startServer((url, res) => {
      expect(url.pathname).toBe("/v1/models");
      json(res, 200, {
        object: "list",
        data: [
          { id: "qwen3:8b", object: "model" },
          { id: "llama3.1:70b", object: "model" },
          { id: "qwen3:8b", object: "model" },
          { id: "", object: "model" },
        ],
      });
    });
    const models = await discoverProviderModels(
      provider({ baseUrl: `${baseUrl}/v1`, apiKey: "sk-local" })
    );
    expect(requests[0].headers.authorization).toBe("Bearer sk-local");
    expect(models.map(m => m.id)).toEqual(["llama3.1:70b", "qwen3:8b"]);
    expect(models[0]).toEqual({ id: "llama3.1:70b", name: "llama3.1:70b", fromCatalog: false });
  });

  it("无 key 时不发 Authorization 头（本地服务）", async () => {
    const { baseUrl, requests } = await startServer((_url, res) =>
      json(res, 200, { data: [{ id: "m" }] })
    );
    await discoverProviderModels(provider({ baseUrl }));
    expect(requests[0].headers.authorization).toBeUndefined();
  });

  it("识别常见的自报字段（OpenRouter / LM Studio 形状）", async () => {
    const { baseUrl } = await startServer((_url, res) =>
      json(res, 200, {
        data: [
          {
            id: "vendor/vision-reasoner",
            name: "Vision Reasoner",
            context_length: 262144,
            architecture: { input_modalities: ["text", "image"] },
            supported_parameters: ["tools", "reasoning"],
            top_provider: { max_completion_tokens: 32768 },
          },
          { id: "local-model", max_context_length: 32768 },
        ],
      })
    );
    const models = await discoverProviderModels(provider({ baseUrl }));
    expect(models.find(m => m.id === "vendor/vision-reasoner")).toEqual({
      id: "vendor/vision-reasoner",
      name: "Vision Reasoner",
      fromCatalog: false,
      input: ["text", "image"],
      reasoning: true,
      contextWindow: 262144,
      maxTokens: 32768,
    });
    expect(models.find(m => m.id === "local-model")).toMatchObject({ contextWindow: 32768 });
  });

  it("Ollama 原生 {models:[…]} 形状", async () => {
    const { baseUrl } = await startServer((_url, res) =>
      json(res, 200, { models: [{ name: "gemma3:4b", model: "gemma3:4b" }] })
    );
    const models = await discoverProviderModels(provider({ baseUrl }));
    expect(models.map(m => m.id)).toEqual(["gemma3:4b"]);
  });

  it("Anthropic：x-api-key + version 头，跟随 has_more 分页", async () => {
    const { baseUrl, requests } = await startServer((url, res) => {
      expect(url.pathname).toBe("/v1/models");
      if (!url.searchParams.get("after_id")) {
        json(res, 200, {
          data: [{ id: "claude-a", display_name: "Claude A", type: "model" }],
          has_more: true,
          last_id: "claude-a",
        });
      } else {
        json(res, 200, {
          data: [{ id: "claude-b", display_name: "Claude B", max_input_tokens: 500000 }],
          has_more: false,
          last_id: "claude-b",
        });
      }
    });
    const models = await discoverProviderModels(
      provider({ baseUrl, api: "anthropic-messages", apiKey: "sk-ant" })
    );
    expect(requests).toHaveLength(2);
    expect(requests[0].headers["x-api-key"]).toBe("sk-ant");
    expect(requests[0].headers["anthropic-version"]).toBe("2023-06-01");
    expect(requests[1].url).toContain("after_id=claude-a");
    expect(models.map(m => m.name)).toEqual(["Claude A", "Claude B"]);
    expect(models[1].contextWindow).toBe(500000);
  });

  it("内置服务商：目录命中的模型取目录元数据，目录外的新模型只带自报字段", async () => {
    const [catalogModel] = await listCatalogModels("deepseek");
    expect(catalogModel).toBeDefined();
    const known = (await lookupBuiltinModel("deepseek", catalogModel.id))!;
    const { baseUrl } = await startServer((_url, res) =>
      json(res, 200, { data: [{ id: catalogModel.id }, { id: "deepseek-brand-new" }] })
    );
    const models = await discoverProviderModels(provider({ baseUrl, builtin: "deepseek" }));
    const fresh = models.find(m => m.id === "deepseek-brand-new");
    expect(fresh).toMatchObject({ fromCatalog: false });
    expect(fresh?.contextWindow).toBeUndefined();
    expect(models.find(m => m.id === catalogModel.id)).toMatchObject({
      fromCatalog: true,
      api: known.api,
      contextWindow: known.contextWindow,
      maxTokens: known.maxTokens,
    });
  });

  it("失败原因面向用户：鉴权失败 / 不支持 / 格式不对 / 连不上 / 未填地址", async () => {
    const { baseUrl } = await startServer((url, res) => {
      if (url.pathname === "/auth/models") return json(res, 401, { error: "bad key" });
      if (url.pathname === "/missing/models") return json(res, 404, {});
      json(res, 200, { unexpected: true });
    });
    await expect(discoverProviderModels(provider({ baseUrl: `${baseUrl}/auth` }))).rejects.toThrow(
      "API Key 无效或没有权限"
    );
    await expect(
      discoverProviderModels(provider({ baseUrl: `${baseUrl}/missing` }))
    ).rejects.toThrow("不支持获取模型列表");
    await expect(discoverProviderModels(provider({ baseUrl }))).rejects.toThrow("格式无法识别");
    await expect(discoverProviderModels(provider({ baseUrl: "  " }))).rejects.toThrow(
      "请先填写服务地址"
    );
    await expect(
      discoverProviderModels(provider({ baseUrl: "http://127.0.0.1:1" }))
    ).rejects.toThrow("无法连接到服务地址");
  });
});
