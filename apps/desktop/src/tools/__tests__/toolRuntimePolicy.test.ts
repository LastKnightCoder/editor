import { describe, expect, it } from "vitest";
import { getToolExecutionTimeout } from "@/tools/toolRuntimePolicy";

describe("toolRuntimePolicy", () => {
  it("图片工具超时应为 300 秒", () => {
    expect(getToolExecutionTimeout("generate_image", 30_000)).toBe(300_000);
    expect(getToolExecutionTimeout("edit_image", 30_000)).toBe(300_000);
  });

  it("非图片工具应保留默认超时", () => {
    expect(getToolExecutionTimeout("unknown_tool", 45_000)).toBe(45_000);
  });
});
