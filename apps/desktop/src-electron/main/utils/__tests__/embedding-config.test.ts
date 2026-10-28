// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  LOCAL_EMBEDDING_PIPELINE,
  isLocalEmbeddingConfig,
  resolveEmbeddingConfig,
  upgradeEmbeddingSetting,
} from "../embedding-config";

/** 快照由旧版 resolveEmbeddingConfig 生成（改动本地指纹前必须先确认兼容） */
const LEGACY_LOCAL_FINGERPRINT_AUTO =
  '{"providerType":"local_python","configId":"embedding-default-local","model":"bge-m3","dimensions":1024,"distance":0.6,"devicePolicy":"auto","localModelDir":"","baseUrl":"","runtime":"llama","pipeline":2}';
const LEGACY_LOCAL_FINGERPRINT_CPU =
  '{"providerType":"local_python","configId":"embedding-default-local","model":"bge-m3","dimensions":1024,"distance":0.6,"devicePolicy":"cpu","localModelDir":"","baseUrl":"","runtime":"llama","pipeline":2}';

const legacyLocalSetting = (devicePolicy: "auto" | "cpu"): Record<string, any> => ({
  embeddingProvider: {
    currentConfigId: "embedding-default-local",
    configs: [
      {
        id: "embedding-default-local",
        providerType: "local_python",
        devicePolicy,
        batchSize: 8,
        currentModel: "bge-m3",
        models: [{ name: "bge-m3", contextLength: 1024, distance: 0.6 }],
      },
    ],
  },
});

describe("upgradeEmbeddingSetting", () => {
  it("本地生效配置升级为 active 并冻结维度，local 参数保留", () => {
    const setting = legacyLocalSetting("cpu");
    expect(upgradeEmbeddingSetting(setting)).toBe(true);
    expect(setting).toEqual({
      embedding: {
        active: { provider: "local", model: "bge-m3", dimensions: 1024 },
        local: { source: "modelscope", devicePolicy: "cpu", batchSize: 8 },
        plugins: {},
      },
    });
  });

  it("API 配置生效时 active 为 null，旧 API 配置丢弃、local 参数仍从旧本地配置取", () => {
    const setting = {
      embeddingProvider: {
        currentConfigId: "api-config",
        configs: [
          legacyLocalSetting("auto").embeddingProvider.configs[0],
          {
            id: "api-config",
            providerType: "remote_openai",
            apiKey: "sk-old",
            baseUrl: "https://example.com/v1",
            currentModel: "text-embedding-3-small",
            models: [{ name: "text-embedding-3-small", contextLength: 1536 }],
          },
        ],
      },
    };
    expect(upgradeEmbeddingSetting(setting)).toBe(true);
    expect(setting).toEqual({
      embedding: {
        active: null,
        local: { source: "modelscope", devicePolicy: "auto", batchSize: 8 },
        plugins: {},
      },
    });
  });

  it("currentModel 对应模型的 contextLength 无效时 active 为 null", () => {
    const setting: Record<string, any> = {
      embeddingProvider: {
        currentConfigId: "embedding-default-local",
        configs: [
          {
            id: "embedding-default-local",
            currentModel: "bge-m3",
            models: [{ name: "bge-m3", contextLength: 0 }],
          },
        ],
      },
    };
    upgradeEmbeddingSetting(setting);
    expect(setting.embedding.active).toBeNull();
  });

  it("无旧键时不改动、返回 false", () => {
    const setting = { embedding: { active: null, local: {}, plugins: {} } };
    expect(upgradeEmbeddingSetting(setting)).toBe(false);
    expect(setting).toEqual({ embedding: { active: null, local: {}, plugins: {} } });
  });

  it("非普通对象输入（null / 数组 / 原始值）不抛错、返回 false", () => {
    for (const setting of [null, [], [1], "settings", 42]) {
      expect(upgradeEmbeddingSetting(setting)).toBe(false);
    }
  });
});

describe("本地指纹与旧版逐字节兼容", () => {
  it.each([
    ["auto", LEGACY_LOCAL_FINGERPRINT_AUTO],
    ["cpu", LEGACY_LOCAL_FINGERPRINT_CPU],
  ] as const)("devicePolicy=%s 的旧本地设置升级后指纹不变", (devicePolicy, expected) => {
    const setting = legacyLocalSetting(devicePolicy);
    upgradeEmbeddingSetting(setting);
    const config = resolveEmbeddingConfig(setting);
    expect(config).not.toBeNull();
    expect(config!.fingerprint).toBe(expected);
    expect(isLocalEmbeddingConfig(config)).toBe(true);
    expect(JSON.parse(config!.fingerprint).pipeline).toBe(LOCAL_EMBEDDING_PIPELINE);
  });

  it("升级后的 devicePolicy 变化仍会改变指纹（触发重建）", () => {
    const setting = legacyLocalSetting("auto");
    upgradeEmbeddingSetting(setting);
    const before = resolveEmbeddingConfig(setting)!.fingerprint;
    setting.embedding.local.devicePolicy = "cuda";
    expect(resolveEmbeddingConfig(setting)!.fingerprint).not.toBe(before);
  });
});

describe("resolveEmbeddingConfig", () => {
  it("active 为 null 或不完整时返回 null", () => {
    expect(resolveEmbeddingConfig(null)).toBeNull();
    expect(resolveEmbeddingConfig({})).toBeNull();
    expect(
      resolveEmbeddingConfig({
        embedding: {
          active: null,
          local: { source: "modelscope", devicePolicy: "auto", batchSize: 8 },
          plugins: {},
        },
      })
    ).toBeNull();
    expect(
      resolveEmbeddingConfig({
        embedding: {
          active: { provider: "local", model: "", dimensions: 1024 },
          local: { source: "modelscope", devicePolicy: "auto", batchSize: 8 },
          plugins: {},
        },
      })
    ).toBeNull();
    expect(
      resolveEmbeddingConfig({
        embedding: {
          active: { provider: "local", model: "bge-m3", dimensions: 0 },
          local: { source: "modelscope", devicePolicy: "auto", batchSize: 8 },
          plugins: {},
        },
      })
    ).toBeNull();
  });

  it("插件缺 pluginId 时返回 null", () => {
    expect(
      resolveEmbeddingConfig({
        embedding: {
          active: { provider: "plugin", model: "m", dimensions: 3 },
          local: { source: "modelscope", devicePolicy: "auto", batchSize: 8 },
          plugins: {},
        },
      })
    ).toBeNull();
  });

  it("插件指纹只含 provider/pluginId/model/dimensions，连接配置不参与", () => {
    const setting: Record<string, any> = {
      embedding: {
        active: { provider: "plugin", pluginId: "test.embedding", model: "m", dimensions: 3 },
        local: { source: "modelscope", devicePolicy: "cpu", batchSize: 4 },
        plugins: { "test.embedding": { config: { apiKey: "secret" } } },
      },
    };
    const config = resolveEmbeddingConfig(setting);
    expect(config).not.toBeNull();
    expect(config!.fingerprint).toBe(
      JSON.stringify({ provider: "plugin", pluginId: "test.embedding", model: "m", dimensions: 3 })
    );
    expect(config!.fingerprint).not.toContain("secret");
  });

  it("本地解析结果带默认 distance 与 local 运行参数", () => {
    const config = resolveEmbeddingConfig({
      embedding: {
        active: { provider: "local", model: "bge-m3", dimensions: 1024.9 },
        local: { source: "huggingface", devicePolicy: "cuda", batchSize: 16 },
        plugins: {},
      },
    });
    expect(config).toMatchObject({
      provider: "local",
      model: "bge-m3",
      dimensions: 1024,
      distance: 0.6,
      devicePolicy: "cuda",
      batchSize: 16,
    });
  });
});
