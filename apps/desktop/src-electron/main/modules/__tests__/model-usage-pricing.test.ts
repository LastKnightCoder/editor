// @vitest-environment node
/**
 * 用量计费链路：自定义单价优先于目录价、单发图片内容组装、
 * 以及经 mock 网关的真实流式请求 → pi 按单价算出 cost。
 */
import http from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  normalizeContext,
  type Api,
  type AssistantMessage,
  type Model,
} from "@earendil-works/pi-ai";
import {
  buildSingleShotContext,
  createProviderRegistry,
  resolveModelCost,
} from "../pi-ai-runtime-core";
import { resolveUsageSlot } from "../llm-usage-slot";
import {
  applyCatalogCostFills,
  collectCatalogCostFills,
  isCustomPriced,
} from "../pi-ai-runtime-core";
import type { LLMModelSetting, LLMProviderSetting } from "@/types/pi-llm";

const baseModel = (cost: Model<Api>["cost"]) => ({ cost }) as Model<Api>;
const setting = (overrides: Partial<LLMModelSetting> = {}): LLMModelSetting => ({
  id: "m",
  reasoning: false,
  input: ["text"],
  contextWindow: 8192,
  maxTokens: 1024,
  ...overrides,
});

describe("resolveModelCost", () => {
  const catalog = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };

  it("自定义单价优先于目录价，缓存价缺省为 0，不继承分档价", () => {
    const cost = resolveModelCost(
      setting({ cost: { input: 1, output: 2 } }),
      baseModel({ ...catalog, tiers: [{ ...catalog, input: 6, inputTokensAbove: 200_000 }] })
    );
    expect(cost).toEqual({ input: 1, output: 2, cacheRead: 0, cacheWrite: 0 });
  });

  it("未设置自定义单价时用目录价", () => {
    expect(resolveModelCost(setting(), baseModel(catalog))).toEqual(catalog);
  });

  it("自定义单价无效时回落目录价；都没有时为 0", () => {
    expect(
      resolveModelCost(setting({ cost: { input: -1, output: 2 } }), baseModel(catalog))
    ).toEqual(catalog);
    expect(resolveModelCost(setting())).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });
});

describe("目录价自动填入", () => {
  const catalog = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };
  const provider = (models: LLMModelSetting[]): LLMProviderSetting => ({
    id: "p",
    name: "P",
    baseUrl: "",
    apiKey: "",
    api: "openai-completions",
    models,
  });
  const lookup = async (_p: LLMProviderSetting, modelId: string) =>
    modelId === "in-catalog" ? catalog : undefined;

  it("只给没有单价、且目录有价的模型填入", async () => {
    const providers = [
      provider([
        setting({ id: "in-catalog" }),
        setting({ id: "custom", cost: { input: 1, output: 1 } }),
        setting({ id: "not-in-catalog" }),
      ]),
    ];
    const fills = await collectCatalogCostFills(providers, lookup);
    expect([...fills.keys()]).toEqual(["p\u0000in-catalog"]);
    const next = applyCatalogCostFills(providers, fills)!;
    expect(next[0].models.map(m => m.cost)).toEqual([catalog, { input: 1, output: 1 }, undefined]);
  });

  it("写回时用户已填的价格不被覆盖；无变化返回 null", async () => {
    const fills = await collectCatalogCostFills(
      [provider([setting({ id: "in-catalog" })])],
      lookup
    );
    const edited = [provider([setting({ id: "in-catalog", cost: { input: 9, output: 9 } })])];
    expect(applyCatalogCostFills(edited, fills)).toBeNull();
  });

  it("与目录价相同的单价不算自定义；改过才算", () => {
    expect(isCustomPriced(setting({ cost: { ...catalog } }), catalog)).toBe(false);
    expect(isCustomPriced(setting({ cost: { ...catalog, input: 2 } }), catalog)).toBe(true);
    expect(isCustomPriced(setting({ cost: { input: 1, output: 1 } }), undefined)).toBe(true);
    expect(isCustomPriced(setting(), catalog)).toBe(false);
  });

  it("单价等于目录价时计费沿用目录（保留分档价）", () => {
    const tiers = [{ ...catalog, input: 6, inputTokensAbove: 200_000 }];
    expect(
      resolveModelCost(setting({ cost: { ...catalog } }), baseModel({ ...catalog, tiers }))
    ).toEqual({
      ...catalog,
      tiers,
    });
  });
});

describe("buildSingleShotContext 图片输入", () => {
  it("user 消息带 images 时组装成 text + image 内容块", () => {
    const context = buildSingleShotContext(
      {
        requestId: "r",
        providerId: "p",
        modelId: "m",
        messages: [
          { role: "user", content: "描述图片", images: [{ data: "AAAA", mimeType: "image/png" }] },
        ],
      },
      "p",
      "m"
    );
    expect(context.messages[0]).toMatchObject({
      role: "user",
      content: [
        { type: "text", text: "描述图片" },
        { type: "image", data: "AAAA", mimeType: "image/png" },
      ],
    });
  });

  it("无 images 时仍是纯文本 content", () => {
    const context = buildSingleShotContext(
      {
        requestId: "r",
        providerId: "p",
        modelId: "m",
        messages: [{ role: "user", content: "hi" }],
      },
      "p",
      "m"
    );
    expect(context.messages[0]).toMatchObject({ role: "user", content: "hi" });
  });
});

describe("resolveUsageSlot", () => {
  const providers: LLMProviderSetting[] = [
    {
      id: "p1",
      name: "P1",
      baseUrl: "",
      apiKey: "",
      api: "openai-completions",
      models: [setting({ id: "m1" })],
    },
  ];

  it("槽位分配且模型存在时返回引用", () => {
    expect(
      resolveUsageSlot(
        {
          llmProviders: providers,
          llmUsageSettings: { slot: { providerId: "p1", modelId: "m1" } },
        },
        "slot"
      )
    ).toEqual({ providerId: "p1", modelId: "m1" });
  });

  it("未分配、服务商或模型已删除时返回 null", () => {
    expect(resolveUsageSlot({ llmProviders: providers, llmUsageSettings: {} }, "slot")).toBeNull();
    expect(
      resolveUsageSlot(
        {
          llmProviders: providers,
          llmUsageSettings: { slot: { providerId: "p1", modelId: "gone" } },
        },
        "slot"
      )
    ).toBeNull();
    expect(
      resolveUsageSlot({ llmUsageSettings: { slot: { providerId: "p1", modelId: "m1" } } }, "slot")
    ).toBeNull();
  });

  it("旧版 llmConfigs / modelName 字段不再被识别", () => {
    expect(
      resolveUsageSlot(
        {
          llmUsageSettings: { slot: { providerId: "p1", modelName: "m1" } as never },
          ...({ llmConfigs: [{ id: "p1" }] } as object),
        },
        "slot"
      )
    ).toBeNull();
  });
});

describe("mock 网关：pi 按自定义单价计费", () => {
  let gateway: { port: number; close: () => Promise<void> };

  beforeAll(async () => {
    gateway = await new Promise(resolve => {
      const server = http.createServer((req, res) => {
        req.resume();
        req.on("end", () => {
          const chunks = [
            {
              choices: [
                { index: 0, delta: { role: "assistant", content: "好" }, finish_reason: null },
              ],
            },
            { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
            {
              choices: [],
              usage: {
                prompt_tokens: 1_000_000,
                completion_tokens: 500_000,
                total_tokens: 1_500_000,
              },
            },
          ];
          res.writeHead(200, { "content-type": "text/event-stream" });
          for (const c of chunks) {
            res.write(
              `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 0, model: "m", ...c })}\n\n`
            );
          }
          res.write("data: [DONE]\n\n");
          res.end();
        });
      });
      server.listen(0, "127.0.0.1", () =>
        resolve({
          port: (server.address() as AddressInfo).port,
          close: () => new Promise(r => server.close(() => r())),
        })
      );
    });
  });
  afterAll(async () => {
    await gateway.close();
  });

  it("usage.cost 按自定义单价（每百万 token）计算", async () => {
    const registry = createProviderRegistry();
    const provider: LLMProviderSetting = {
      id: "gw",
      name: "gw",
      baseUrl: `http://127.0.0.1:${gateway.port}/v1`,
      apiKey: "sk",
      api: "openai-completions",
      models: [setting({ id: "m", cost: { input: 2, output: 8 } })],
    };
    await registry.syncProviders([provider]);
    const model = registry.resolveModel("gw", "m")!;
    let done: AssistantMessage | null = null;
    for await (const event of registry.models.streamSimple(
      model,
      normalizeContext(
        buildSingleShotContext(
          {
            requestId: "r",
            providerId: "gw",
            modelId: "m",
            messages: [{ role: "user", content: "hi" }],
          },
          "gw",
          "m"
        )
      )
    )) {
      if (event.type === "done") done = event.message;
    }
    expect(done).not.toBeNull();
    expect(done!.usage.input).toBe(1_000_000);
    expect(done!.usage.output).toBe(500_000);
    // 1M × $2 + 0.5M × $8 = $6
    expect(done!.usage.cost.total).toBeCloseTo(6, 6);
  });
});
