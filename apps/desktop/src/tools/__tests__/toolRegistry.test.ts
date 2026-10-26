import { describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../toolRegistry";

const tool = (name: string) => ({
  name,
  description: name,
  parameters: { type: "object" as const, properties: {} },
  executor: vi.fn(async () => "ok"),
});

describe("ToolRegistry 逐工具停用", () => {
  it("调用名与偏好键独立，沿用稳定键控制新名称", () => {
    const registry = new ToolRegistry();
    registry.setDisabledTools("questions", ["stable-id"]);
    registry.registerTools("questions", [
      { ...tool("questions__list-questions"), settingsKey: "stable-id" },
    ]);
    expect(registry.hasEnabledTool("questions__list-questions")).toBe(false);
    expect(registry.getToolSchemas()).toEqual([]);
    registry.setDisabledTools("questions", []);
    expect(registry.hasEnabledTool("questions__list-questions")).toBe(true);
  });
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

describe("ToolRegistry 作用域工具", () => {
  it("不进全局表，同名可在多个作用域并存，卸载后移除并通知订阅者", () => {
    const registry = new ToolRegistry();
    const listener = vi.fn();
    registry.subscribeScopedSources(listener);

    registry.registerScopedTools("pdf-1", "PDF 文档", [tool("search_pdf")]);
    registry.registerScopedTools("pdf-2", "PDF 文档", [tool("search_pdf")]);

    expect(registry.hasEnabledTool("search_pdf")).toBe(false);
    expect(registry.getToolSchemas()).toEqual([]);
    expect(registry.getScopedTools("pdf-1").map(t => t.source)).toEqual(["pdf-1"]);
    expect(registry.getScopedTools("pdf-2").map(t => t.source)).toEqual(["pdf-2"]);
    expect(registry.getScopedTools(undefined)).toEqual([]);

    const snapshot = registry.getScopedSources();
    expect(
      snapshot.map(s => ({ scope: s.scope, label: s.label, names: s.tools.map(t => t.name) }))
    ).toEqual([
      { scope: "pdf-1", label: "PDF 文档", names: ["search_pdf"] },
      { scope: "pdf-2", label: "PDF 文档", names: ["search_pdf"] },
    ]);
    expect(registry.getScopedSources()).toBe(snapshot);

    registry.unregisterSource("pdf-1");
    expect(registry.getScopedSources().map(s => s.scope)).toEqual(["pdf-2"]);
    expect(listener).toHaveBeenCalledTimes(3);

    registry.unregisterSource("other");
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
