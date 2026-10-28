// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  localEmbedTexts: vi.fn(),
  relayEmbed: vi.fn(),
  relayMaxBatchSize: vi.fn(),
  getSettingSnapshot: vi.fn(),
}));

vi.mock("../local-inference", () => ({
  default: {
    embedTexts: mocks.localEmbedTexts,
    embeddingHealth: vi.fn(),
  },
}));

vi.mock("../../services/plugin-embeddings", () => ({
  pluginEmbeddingsRelay: {
    embed: mocks.relayEmbed,
    maxBatchSize: mocks.relayMaxBatchSize,
  },
}));

vi.mock("../user-setting", () => ({
  default: {
    getSettingSnapshot: mocks.getSettingSnapshot,
  },
}));

import embeddingService from "../embedding-service";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("embeddingService 本地分支", () => {
  it("透传文本与模型参数，缺省 batchSize/devicePolicy 兜底，默认后台优先级", async () => {
    mocks.localEmbedTexts.mockResolvedValue({
      embeddings: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      dimensions: 2,
      device: "cpu",
    });

    const result = await embeddingService.embedTexts(
      {
        provider: "local",
        model: "bge-m3",
        dimensions: 2,
      },
      ["一", "二"]
    );

    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(mocks.localEmbedTexts).toHaveBeenCalledWith(["一", "二"], {
      modelName: "bge-m3",
      batchSize: 8,
      devicePolicy: "auto",
      priority: "background",
    });
  });

  it("interactive 时按 interactive 优先级提交", async () => {
    mocks.localEmbedTexts.mockResolvedValue({ embeddings: [[1]], dimensions: 1, device: "cpu" });

    await embeddingService.embedTexts(
      { provider: "local", model: "bge-m3", dimensions: 1, batchSize: 4, devicePolicy: "cuda" },
      ["查询"],
      { interactive: true }
    );

    expect(mocks.localEmbedTexts).toHaveBeenCalledWith(["查询"], {
      modelName: "bge-m3",
      batchSize: 4,
      devicePolicy: "cuda",
      priority: "interactive",
    });
  });

  it("本地返回维度与配置不符时抛错", async () => {
    mocks.localEmbedTexts.mockResolvedValue({
      embeddings: [[1, 2, 3]],
      dimensions: 3,
      device: "cpu",
    });

    await expect(
      embeddingService.embedTexts({ provider: "local", model: "bge-m3", dimensions: 2 }, ["一"])
    ).rejects.toThrow("Embedding 维度不匹配：配置 2，实际 3");
  });

  it("空文本直接返回空数组，不启动推理", async () => {
    await expect(
      embeddingService.embedTexts({ provider: "local", model: "bge-m3", dimensions: 2 }, [])
    ).resolves.toEqual([]);
    expect(mocks.localEmbedTexts).not.toHaveBeenCalled();
  });
});

describe("embeddingService 插件分支", () => {
  const target = {
    provider: "plugin" as const,
    pluginId: "test.embedding",
    model: "m",
    dimensions: 2,
  };
  const pluginConfig = { apiKey: "k" };

  beforeEach(() => {
    mocks.getSettingSnapshot.mockResolvedValue({
      embedding: { plugins: { "test.embedding": { config: pluginConfig } } },
    });
  });

  it("按提供方 maxBatchSize 顺序分批、逐批回调进度并拼接结果", async () => {
    mocks.relayMaxBatchSize.mockReturnValue(2);
    mocks.relayEmbed.mockImplementation(
      async (_id: string, _config: unknown, _model: string, texts: string[]) =>
        texts.map(() => [0.1, 0.2])
    );
    const onProgress = vi.fn();

    const result = await embeddingService.embedTexts(target, ["a", "b", "c", "d", "e"], {
      onProgress,
    });

    expect(result).toHaveLength(5);
    expect(result.every(vector => vector.length === 2)).toBe(true);
    expect(mocks.relayEmbed).toHaveBeenCalledTimes(3);
    expect(mocks.relayEmbed.mock.calls.map(call => call[3])).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
    expect(onProgress).toHaveBeenNthCalledWith(1, 2, 5);
    expect(onProgress).toHaveBeenNthCalledWith(2, 4, 5);
    expect(onProgress).toHaveBeenNthCalledWith(3, 5, 5);
  });

  it("未声明 maxBatchSize 时按默认 32 分批，signal 透传给 relay", async () => {
    mocks.relayMaxBatchSize.mockReturnValue(undefined);
    mocks.relayEmbed.mockResolvedValue([[1, 2]]);
    const controller = new AbortController();

    const result = await embeddingService.embedTexts(target, ["q"], { signal: controller.signal });

    expect(result).toEqual([[1, 2]]);
    expect(mocks.relayEmbed).toHaveBeenCalledWith(
      "test.embedding",
      pluginConfig,
      "m",
      ["q"],
      controller.signal
    );
  });

  it("插件配置缺失或 pluginId 缺失时报尚未配置，不发起调用", async () => {
    mocks.getSettingSnapshot.mockResolvedValue({ embedding: { plugins: {} } });
    await expect(embeddingService.embedTexts(target, ["q"])).rejects.toThrow("嵌入插件尚未配置");
    await expect(
      embeddingService.embedTexts({ ...target, pluginId: undefined }, ["q"])
    ).rejects.toThrow("嵌入插件尚未配置");
    expect(mocks.relayEmbed).not.toHaveBeenCalled();
  });

  it("插件返回维度与配置不符时抛错", async () => {
    mocks.relayMaxBatchSize.mockReturnValue(undefined);
    mocks.relayEmbed.mockResolvedValue([[1, 2, 3]]);

    await expect(embeddingService.embedTexts(target, ["q"])).rejects.toThrow(
      "Embedding 维度不匹配：配置 2，实际 3"
    );
  });
});
