/**
 * 聊天侧思考档位（M3-g）：可选档位来自模型真实能力（预设目录），不再是硬编码四档；
 * 旧本地存储里的 "none" 要归一到 "off"（类型收敛前后的取值差异）。
 */
import { describe, expect, it } from "vitest";
import {
  clampThinkingLevel,
  normalizeStoredThinkingLevel,
  resolveThinkingLevelOptions,
} from "../llmCatalog";
import type { PiThinkingLevel } from "@/types/pi-llm";

describe("本地存储的档位归一", () => {
  it("旧枚举 none 与空值都归到 off", () => {
    expect(normalizeStoredThinkingLevel("none")).toBe("off");
    expect(normalizeStoredThinkingLevel(undefined)).toBe("off");
    expect(normalizeStoredThinkingLevel("")).toBe("off");
  });

  it("其余档位原样保留（含此前渲染端不可达的 minimal）", () => {
    expect(normalizeStoredThinkingLevel("minimal")).toBe("minimal");
    expect(normalizeStoredThinkingLevel("xhigh")).toBe("xhigh");
  });
});

describe("可选档位", () => {
  it("不支持推理的模型只有「不思考」", () => {
    expect(
      resolveThinkingLevelOptions({ reasoning: false, catalogLevels: ["off", "high"] })
    ).toEqual(["off"]);
    expect(resolveThinkingLevelOptions({ reasoning: undefined, catalogLevels: [] })).toEqual([
      "off",
    ]);
  });

  it("目录给出真实档位时照用（gpt-5 这类没有 off 的模型不会多出「不思考」）", () => {
    const levels: PiThinkingLevel[] = ["minimal", "low", "medium", "high"];
    expect(resolveThinkingLevelOptions({ reasoning: true, catalogLevels: levels })).toEqual(levels);
  });

  it("目录未收录的模型退回通用档", () => {
    expect(resolveThinkingLevelOptions({ reasoning: true, catalogLevels: [] })).toEqual([
      "off",
      "low",
      "medium",
      "high",
    ]);
  });
});

describe("选中档位的收敛", () => {
  it("模型不支持所选档位时落到第一个可选档（界面显示与实际一致）", () => {
    expect(clampThinkingLevel("off", ["minimal", "low", "high"])).toBe("minimal");
    expect(clampThinkingLevel("xhigh", ["off", "low"])).toBe("off");
  });

  it("支持则原样保留", () => {
    expect(clampThinkingLevel("high", ["off", "low", "high"])).toBe("high");
  });

  it("可选档位为空时兜底 off（模型信息缺失也不该崩）", () => {
    expect(clampThinkingLevel("high", [])).toBe("off");
  });
});
