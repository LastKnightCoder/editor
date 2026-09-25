import { describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../toolRegistry";

const tool = (name: string) => ({
  name,
  description: name,
  parameters: { type: "object" as const, properties: {} },
  executor: vi.fn(async () => "ok"),
});

describe("ToolRegistry 逐工具停用", () => {
  it("停用的工具不出现在 schema 中、执行时拒绝，重新注册后仍保留", async () => {
    const registry = new ToolRegistry();
    registry.setDisabledTools("fs", ["write_file"]);
    registry.registerTools("fs", [tool("read_file"), tool("write_file")]);

    expect(registry.getToolSchemas().map(s => s.function.name)).toEqual(["read_file"]);
    expect(registry.hasEnabledTool("write_file")).toBe(false);
    expect(registry.getRegisteredTools().find(t => t.name === "write_file")?.enabled).toBe(false);

    const result = await registry.executeToolCall({
      id: "1",
      type: "function",
      function: { name: "write_file", arguments: "{}" },
    });
    expect(result?.content).toBe("工具 write_file 当前未启用");

    registry.unregisterSource("fs");
    registry.registerTools("fs", [tool("write_file")]);
    expect(registry.hasEnabledTool("write_file")).toBe(false);

    registry.setDisabledTools("fs", []);
    expect(registry.hasEnabledTool("write_file")).toBe(true);
  });

  it("来源级停用优先于工具级", () => {
    const registry = new ToolRegistry();
    registry.registerTools("fs", [tool("read_file")], false);
    expect(registry.hasEnabledTool("read_file")).toBe(false);
  });
});
