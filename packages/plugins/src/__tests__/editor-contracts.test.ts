import { describe, expect, it } from "vitest";
import { defineEditorElement, defineEditorExtension, definePlugin } from "../index";
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
  });

describe("作者节点契约与精确版本读取", () => {
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
    expect(() => defineEditorElement({ ...v1(), dataVersion: undefined })).toThrow("dataVersion");
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
