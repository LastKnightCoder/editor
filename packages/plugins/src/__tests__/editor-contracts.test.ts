import { describe, expect, it } from "vitest";
import { defineEditorElement, defineEditorExtension, definePlugin } from "../index";
import { ElementContractCatalog } from "../editor-contracts";
import { ContentPluginRegistry } from "../content";

const v1 = () =>
  defineEditorElement({
    type: "example.diagram",
    dataVersion: 1,
    kind: "block",
    isVoid: true,
    collaboration: { textFields: ["source"] },
    render: () => null,
  });
const v2 = () =>
  defineEditorElement({
    type: "example.diagram",
    dataVersion: 2,
    kind: "block",
    isVoid: true,
    collaboration: { textFields: ["code"] },
    render: () => null,
    previousVersions: [{ element: v1(), access: "edit" }],
    migrations: [
      {
        from: 1,
        migrate(data) {
          if (Object.hasOwn(data, "code")) throw new Error("目标字段已存在");
          const { source, ...remaining } = data;
          return { ...remaining, code: source };
        },
      },
    ],
  });

describe("作者节点契约与直接版本转换", () => {
  it("v2 保留 v1 编辑，转换只改业务字段且保留身份、子树和未知属性", async () => {
    const catalog = await ElementContractCatalog.prepare([{ owner: "example", elements: [v2()] }]);
    const old = Object.entries(catalog.dictionary).find(
      ([, contract]) => contract.dataVersion === 1
    )!;
    const node = {
      type: "example.diagram",
      collabId: "stable",
      tauContract: old[0],
      source: "甲",
      custom: { keep: 7 },
      children: [{ text: "" }],
    };
    expect(catalog.resolve(node)?.access).toBe("edit");
    expect(catalog.resolve(node)?.element.collaboration?.textFields).toEqual(["source"]);
    const converted = catalog.migrate(node);
    expect(converted).toEqual({
      type: node.type,
      collabId: node.collabId,
      tauContract: catalog.current(node.type)?.id,
      code: "甲",
      custom: { keep: 7 },
      children: [{ text: "" }],
    });
    expect(node.source).toBe("甲");
    expect(node).not.toHaveProperty("code");
    expect(converted.children).not.toBe(node.children);
  });

  it("冲突、无效数据和未知契约不静默转换", async () => {
    const catalog = await ElementContractCatalog.prepare([{ owner: "example", elements: [v2()] }]);
    const old = Object.keys(catalog.dictionary).find(
      id => catalog.dictionary[id].dataVersion === 1
    )!;
    const node = { type: "example.diagram", tauContract: old, source: "甲", children: [] };
    expect(() => catalog.migrate({ ...node, code: "乙" })).toThrow("已存在");
    expect(() => catalog.migrate({ ...node, source: 1 })).toThrow("文本字段");
    expect(() => catalog.migrate({ ...node, tauContract: "unknown" })).toThrow("契约");
    const cycle: Record<string, unknown> = { ...node };
    cycle.self = cycle;
    expect(() => catalog.migrate(cycle)).toThrow("嵌套");
  });

  it("声明阶段拒绝版本重复、类型不一致、未声明来源和缺少版本", () => {
    const current = v2();
    expect(() =>
      defineEditorElement({ ...current, previousVersions: [{ element: current, access: "read" }] })
    ).toThrow("版本重复");
    expect(() =>
      defineEditorElement({
        ...current,
        previousVersions: [{ element: { ...v1(), type: "other" }, access: "read" }],
      })
    ).toThrow("历史节点");
    expect(() =>
      defineEditorElement({ ...current, migrations: [{ from: 3, migrate: data => ({ ...data }) }] })
    ).toThrow("转换来源");
    expect(() => defineEditorElement({ ...v1(), dataVersion: undefined })).toThrow("dataVersion");
  });

  it("纯函数输入冻结，返回结构字段和异步值不被提交", async () => {
    for (const migrate of [
      () => ({ type: "hijacked", code: "甲" }),
      () => Promise.resolve({ code: "甲" }),
      (data: Readonly<Record<string, unknown>>) => {
        (data.nested as { value: number }).value = 9;
        return { code: "甲" };
      },
    ]) {
      const element = { ...v2(), migrations: [{ from: 1, migrate }] };
      const catalog = await ElementContractCatalog.prepare([
        { owner: "example", elements: [element as ReturnType<typeof v2>] },
      ]);
      const old = Object.keys(catalog.dictionary).find(
        id => catalog.dictionary[id].dataVersion === 1
      )!;
      const node = {
        type: "example.diagram",
        tauContract: old,
        source: "甲",
        nested: { value: 7 },
        children: [],
      };
      expect(() => catalog.migrate(node)).toThrow();
      expect(node.nested.value).toBe(7);
    }
  });

  it("静态注册表准备契约，安装新声明使旧的在途结果失效", async () => {
    const registry = new ContentPluginRegistry();
    const plugin = (element: ReturnType<typeof v1>) =>
      definePlugin({
        id: "example",
        name: "示例",
        version: "1",
        editorExtensions: [defineEditorExtension({ id: "example.diagram", elements: [element] })],
      });
    registry.install([plugin(v1())]);
    const previous = registry.prepareContracts();
    registry.install([plugin(v2())]);
    await expect(previous).rejects.toThrow("已更新");
    const next = await registry.prepareContracts();
    expect(next.current("example.diagram")?.contract.dataVersion).toBe(2);
  });
});
