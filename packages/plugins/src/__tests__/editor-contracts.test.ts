import { describe, expect, it } from "vitest";
import { defineEditorElement, defineEditorExtension, definePlugin } from "../index";
import { ContentPluginRegistry } from "../content";
import { ElementContractCatalog, RECOVERED_OWNER } from "../editor-contracts";
import type { ElementContractDefinition } from "@tau/editor/contracts";

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

describe("修复已存正文", () => {
  const paragraph: ElementContractDefinition = { type: "paragraph", dataVersion: 1, kind: "block" };
  const link: ElementContractDefinition = { type: "content-link", dataVersion: 1, kind: "inline" };
  const catalog = () =>
    ElementContractCatalog.prepare([
      { owner: "tau.paragraph", elements: [paragraph] },
      { owner: "host.content-link", elements: [link] },
    ]);
  const text = (value: string) => ({ type: "formatted", text: value });

  it("合格正文原样返回，不改身份与契约", async () => {
    const value = await catalog();
    const good = await value.createDocument([
      { type: "paragraph", children: [text("正文")] },
    ] as never);
    const result = await value.repairDocument(good.content, good.contracts);
    expect(result.repaired).toBe(false);
    expect(result.content).toEqual(good.content);
  });

  it("补身份与契约、重复身份重新分配，已有有效身份保留", async () => {
    const value = await catalog();
    const pid = value.current("paragraph")!.id;
    const result = await value.repairDocument([
      { type: "paragraph", collabId: "keep", tauContract: pid, children: [text("a")] },
      { type: "paragraph", collabId: "keep", tauContract: "deadbeef", children: [text("b")] },
      {
        type: "paragraph",
        children: [text("c"), { type: "content-link", contentId: 2, children: [text("链接")] }],
      },
    ]);
    expect(result.repaired).toBe(true);
    const nodes = result.content as unknown as Record<string, unknown>[];
    expect(nodes[0].collabId).toBe("keep");
    expect(nodes[1].collabId).not.toBe("keep");
    expect(nodes[1].tauContract).toBe(pid);
    const inline = (nodes[2].children as Record<string, unknown>[])[1];
    expect(inline).toMatchObject({ type: "content-link", contentId: 2 });
    expect(result.contracts[inline.tauContract as string].owner).toBe("host.content-link");
  });

  it("当前没有声明的节点保留原数据，按内联/块级合成保留契约", async () => {
    const value = await catalog();
    const result = await value.repairDocument([
      { type: "missing.block", source: "旧源码", children: [text("")] },
      { type: "paragraph", children: [text("x"), { type: "missing.inline", v: 1, children: [] }] },
    ]);
    const [block, para] = result.content as unknown as Record<string, unknown>[];
    expect(block).toMatchObject({ type: "missing.block", source: "旧源码" });
    expect(result.contracts[block.tauContract as string]).toMatchObject({
      owner: RECOVERED_OWNER,
      kind: "block",
    });
    const inline = (para.children as Record<string, unknown>[])[1];
    expect(inline).toMatchObject({ type: "missing.inline", v: 1, children: [text("")] });
    expect(result.contracts[inline.tauContract as string]).toMatchObject({ kind: "inline" });
  });

  it("根上的裸文本包成段落，空正文得到空段落，损坏的字典整体弃用", async () => {
    const value = await catalog();
    const result = await value.repairDocument([text("裸文本")], { broken: { x: 1 } } as never);
    expect(result.content).toMatchObject([{ type: "paragraph", children: [text("裸文本")] }]);
    expect(result.contracts.broken).toBeUndefined();
    expect((await value.repairDocument([])).content).toMatchObject([{ type: "paragraph" }]);
  });
});
