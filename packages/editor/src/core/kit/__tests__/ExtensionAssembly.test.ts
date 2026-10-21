import { describe, expect, it, vi } from "vitest";

import {
  defineElement,
  defineExtension,
  EXTENSION_API_VERSION,
  type EditorExtension,
  type Plugin,
} from "../../api";
import { ExtensionAssembly } from "../ExtensionAssembly";

const createExtension = (type: string, label: string, plugins: unknown[] = []) =>
  defineExtension({
    id: `test.${type}-${label}`,
    elements: [
      {
        type,
        kind: "block",
        render: () => label as never,
      },
    ],
    plugins: plugins as never,
  });

const renderedBy = (assembly: ExtensionAssembly, type: string) =>
  assembly.render({ element: { type, children: [] }, attributes: {}, children: null } as never);

describe("ExtensionAssembly", () => {
  // 原 PluginOptimizer.test.ts 的用例：不同装配的同 type 分发表必须互不影响
  it("不同装配的同 type 分发互不影响", () => {
    const first = createExtension("same-type", "first");
    const second = createExtension("same-type", "second");

    // v2 的 render 经 Suspense 包装，断言取内层渲染组件区分贡献者
    const rendererOf = (extension: ReturnType<typeof createExtension>) =>
      extension.elements![0].render;
    expect(rendererOf(first)).not.toBe(rendererOf(second));
    expect(new ExtensionAssembly([first]).hasElement("same-type")).toBe(true);
    expect(new ExtensionAssembly([second]).hasElement("same-type")).toBe(true);
  });

  it("列表内同 type 后者生效（kit 只在显式 override 时才会产生这种列表）", () => {
    const first = createExtension("same-type", "first");
    const second = createExtension("same-type", "second");

    const assembly = new ExtensionAssembly([first, second]);
    // 后声明的渲染器落在分发表里
    expect(assembly.hasElement("same-type")).toBe(true);
    expect(assembly.elementTypes.filter(type => type === "same-type")).toHaveLength(1);
  });

  it("按顺序收集插件", () => {
    const a = createExtension("a", "a", ["pa"]);
    const b = createExtension("b", "b", ["pb"]);
    // schema 判定插件（函数）在每组前头，过滤后看业务插件顺序
    const own = new ExtensionAssembly([a, b]).plugins.filter(
      plugin => typeof plugin !== "function"
    );
    expect(own).toEqual(["pa", "pb"]);
  });

  it("单个扩展装配抛错不影响其他扩展", () => {
    // v2 的贡献是静态声明，收集期几乎没有用户代码；用 getter 模拟「收集期访问贡献时抛错」
    const broken: EditorExtension = {
      apiVersion: EXTENSION_API_VERSION,
      id: "test.broken",
      elements: [
        {
          type: "broken",
          kind: "block" as const,
          render: () => null as never,
        },
      ],
      get plugins(): readonly Plugin[] {
        throw new Error("boom");
      },
    };
    const healthy = createExtension("healthy", "healthy", ["ok"]);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const assembly = new ExtensionAssembly([broken, healthy]);

    expect(assembly.plugins.filter(plugin => typeof plugin !== "function")).toEqual(["ok"]);
    expect(assembly.hasElement("healthy")).toBe(true);
    expect(assembly.hasElement("broken")).toBe(false);
    expect(assembly.extensions.map(extension => extension.id)).toContain("test.broken");
    expect(error).toHaveBeenCalled();
  });

  describe("输入规则", () => {
    const withMark = (inputRules: EditorExtension["inputRules"]) =>
      defineExtension({
        id: "test.rule",
        marks: [{ id: "test.bold", keys: ["bold"], render: () => null }],
        inputRules,
      });

    it("按扩展收集并记录来源", () => {
      const rule = { id: "test.bold", delimiter: "**", marks: { bold: true } };
      expect(new ExtensionAssembly([withMark([rule])]).inputRules).toEqual([
        { owner: "test.rule", rule },
      ]);
    });

    it.each([
      [
        [
          { id: "a", delimiter: "*", marks: { bold: true } },
          { id: "a", delimiter: "_", marks: { bold: true } },
        ],
        "重复",
      ],
      [[{ id: "a", delimiter: "*_", marks: { bold: true } }], "同一字符"],
      [[{ id: "a", delimiter: "*", marks: { italic: true } }], "未声明"],
    ])("非法声明在 kit 创建时报错（%#）", (rules, message) => {
      expect(() => new ExtensionAssembly([withMark(rules)])).toThrow(message);
    });
  });
});
