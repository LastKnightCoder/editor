/**
 * 勾选模型的列表合并（M3-f）：预设目录在前、获取结果只追加目录没有的；
 * 获取来的模型写入设置时只写有依据的字段，能力未知按最保守处理。
 */
import { describe, expect, it } from "vitest";
import { discoveredModelToSetting, mergePickerItems } from "../components/ModelPickerDialog";
import type { PiCatalogModel, PiDiscoveredModel } from "@/types/pi-llm";

const catalog: PiCatalogModel[] = [
  {
    id: "m1",
    name: "Model 1",
    api: "anthropic-messages",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 200_000,
    maxTokens: 64_000,
    thinkingLevels: ["off", "high"],
  },
];

describe("勾选模型列表合并", () => {
  it("目录在前，获取结果去重后追加，重复时保留目录元数据", () => {
    const discovered: PiDiscoveredModel[] = [
      { id: "m1", name: "m1", fromCatalog: false },
      { id: "m2", name: "Model 2", fromCatalog: false, contextWindow: 32_000 },
    ];
    const items = mergePickerItems(catalog, discovered);
    expect(items.map(item => item.id)).toEqual(["m1", "m2"]);
    expect(items[0]).toMatchObject({ name: "Model 1", fromServiceOnly: false });
    expect(items[0].setting).toMatchObject({ api: "anthropic-messages", contextWindow: 200_000 });
    expect(items[1]).toMatchObject({ fromServiceOnly: true, contextWindow: 32_000 });
  });

  it("获取结果中目录命中的条目不算「仅服务商列出」", () => {
    const items = mergePickerItems(
      [],
      [{ id: "x", name: "X", fromCatalog: true, api: "openai-completions", reasoning: false }]
    );
    expect(items[0].fromServiceOnly).toBe(false);
  });
});

describe("获取结果 → 设置条目", () => {
  it("能力未知时按保守值（不推理、仅文本），不写入猜测的上下文窗口", () => {
    expect(
      discoveredModelToSetting({ id: "qwen3:8b", name: "qwen3:8b", fromCatalog: false })
    ).toEqual({ id: "qwen3:8b", reasoning: false, input: ["text"] });
  });

  it("有依据的字段原样带入", () => {
    expect(
      discoveredModelToSetting({
        id: "v",
        name: "Vision",
        fromCatalog: false,
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 131_072,
        maxTokens: 8_192,
        api: "openai-completions",
      })
    ).toEqual({
      id: "v",
      name: "Vision",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 131_072,
      maxTokens: 8_192,
      api: "openai-completions",
    });
  });
});
