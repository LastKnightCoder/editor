import { describe, expect, it } from "vitest";
import PluginManager from "../PluginManager";
import { builtInPlugins } from "../plugins";
import type { CellPlugin } from "../types";

const stubPlugin = (overrides: Partial<CellPlugin<unknown>>): CellPlugin<unknown> => ({
  type: "stub",
  name: "桩",
  Renderer: () => null,
  ...overrides,
});

describe("PluginManager 字段能力", () => {
  it("声明了的能力返回 true，未声明与未注册类型返回 false", () => {
    const manager = new PluginManager();
    manager.registerPlugin(stubPlugin({ capabilities: { date: true, boolean: true } }));

    expect(manager.hasCapability("stub", "date")).toBe(true);
    expect(manager.hasCapability("stub", "boolean")).toBe(true);
    expect(manager.hasCapability("stub", "singleOption")).toBe(false);
    expect(manager.hasCapability("stub", "images")).toBe(false);
    expect(manager.hasCapability("missing", "date")).toBe(false);
  });

  it("内置插件按约定声明能力，multiSelect 与公式不声明", () => {
    const manager = new PluginManager();
    manager.registerPlugins(builtInPlugins as CellPlugin<unknown>[]);

    expect(manager.hasCapability("date", "date")).toBe(true);
    expect(manager.hasCapability("select", "singleOption")).toBe(true);
    expect(manager.hasCapability("checkbox", "boolean")).toBe(true);
    expect(manager.hasCapability("multiSelect", "singleOption")).toBe(false);
    expect(manager.hasCapability("formula", "date")).toBe(false);
    expect(manager.hasCapability("text", "date")).toBe(false);
  });
});

describe("PluginManager 注册与替换", () => {
  it("重复注册同一 type 报错，错误信息带 type", () => {
    const manager = new PluginManager();
    manager.registerPlugin(stubPlugin({ type: "dup" }));
    expect(() => manager.registerPlugin(stubPlugin({ type: "dup" }))).toThrowError("dup");
  });

  it("批量注册内部重复同样报错", () => {
    const manager = new PluginManager();
    expect(() =>
      manager.registerPlugins([stubPlugin({ type: "dup" }), stubPlugin({ type: "dup" })])
    ).toThrowError("dup");
  });

  it("replacePlugin 仅替换已存在类型，替换后能力跟随新插件", () => {
    const manager = new PluginManager();
    manager.registerPlugin(stubPlugin({ type: "hosted", capabilities: { date: true } }));

    manager.replacePlugin(stubPlugin({ type: "hosted", name: "替换版" }));
    expect(manager.getPlugin("hosted")?.name).toBe("替换版");
    expect(manager.hasCapability("hosted", "date")).toBe(false);

    expect(() => manager.replacePlugin(stubPlugin({ type: "missing" }))).toThrowError("missing");
  });
});
