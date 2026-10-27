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

describe("无界面转换的契约目录", () => {
  const link = { type: "host.link", dataVersion: 1, kind: "inline" } as const;

  it("纯声明组加已装插件建目录，按组 id 与插件 id 归属", async () => {
    const registry = new ContentPluginRegistry();
    registry.install([
      definePlugin({
        id: "example",
        name: "示例",
        version: "1",
        editorExtensions: [defineEditorExtension({ id: "example", elements: [v2()] })],
      }),
    ]);
    const groups = [{ id: "host.link", elements: [link] }];
    const catalog = await registry.prepareElementContracts(groups);
    expect(catalog.current("host.link")?.contract.owner).toBe("host.link");
    expect(catalog.current("example.diagram")?.contract.owner).toBe("example");
    expect(await registry.prepareElementContracts(groups)).toBe(catalog);
  });

  it("codec 没有对应节点声明时建处理器即失败，而不是导出为无损载荷", async () => {
    const registry = new ContentPluginRegistry();
    const codec = { type: "host.link", serializer: { toMarkdown: () => "" } };
    await expect(registry.prepareMarkdown([], { contracts: {}, codecs: [codec] })).rejects.toThrow(
      "Markdown codec 缺少节点声明：host.link"
    );
    await expect(
      registry.prepareMarkdown([{ id: "host.link", elements: [link] }], {
        contracts: {},
        codecs: [codec],
      })
    ).resolves.toBeDefined();
  });
});
