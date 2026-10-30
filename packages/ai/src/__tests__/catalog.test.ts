import { describe, expect, it } from "vitest";
import { listCatalogModels, listCatalogProviders } from "../catalog";

const APIS = ["openai-completions", "openai-responses", "anthropic-messages"];

describe("内置模型目录", () => {
  it("服务商与模型只含三种协议，网关占位符不当作 baseUrl", () => {
    const providers = listCatalogProviders();
    expect(providers.length).toBeGreaterThan(0);
    expect(providers.map(p => p.name)).toEqual(
      [...providers.map(p => p.name)].sort((a, b) => a.localeCompare(b))
    );
    for (const provider of providers) {
      expect(APIS).toContain(provider.api);
      expect(provider.baseUrl ?? "").not.toContain("{");
      const models = listCatalogModels(provider.id);
      expect(models).toHaveLength(provider.modelCount);
      for (const model of models) expect(APIS).toContain(model.api);
    }
    expect(listCatalogModels("google")).toEqual([]);
    expect(listCatalogModels("不存在")).toEqual([]);
  });

  it("deepseek 存在且模型字段齐全", () => {
    const deepseek = listCatalogProviders().find(p => p.id === "deepseek");
    expect(deepseek?.baseUrl).toMatch(/^https:\/\//);
    const models = listCatalogModels("deepseek");
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(typeof model.reasoning).toBe("boolean");
      expect(model.input).toContain("text");
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(model.maxTokens).toBeGreaterThan(0);
      expect(Array.isArray(model.thinkingLevels)).toBe(true);
      expect(model.thinkingLevels.length > 0).toBe(model.reasoning);
    }
  });
});
