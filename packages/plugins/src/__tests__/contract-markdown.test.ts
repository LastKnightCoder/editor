import { describe, expect, it, vi } from "vitest";
import { defineEditorElement, defineEditorExtension, definePlugin } from "../index";
import { ElementContractCatalog } from "../editor-contracts";
import { createContractMarkdownProcessor } from "../contract-markdown";
import { ContentPluginRegistry } from "../content";
import type { Descendant } from "slate";
import { addExportFootnote, type MarkdownCodec } from "@tau/markdown";

async function setup() {
  const previous = defineEditorElement({
    type: "example.source",
    dataVersion: 1,
    kind: "block",
    isVoid: true,
    collaboration: { textFields: ["source"] },
    render: () => null,
  });
  const current = defineEditorElement({
    type: "example.source",
    dataVersion: 2,
    kind: "block",
    isVoid: true,
    collaboration: { textFields: ["code"] },
    previousVersions: [{ element: previous, access: "edit" }],
    render: () => null,
  });
  const catalog = await ElementContractCatalog.prepare([{ owner: "example", elements: [current] }]);
  const oldId = Object.keys(catalog.dictionary).find(
    id => catalog.dictionary[id].dataVersion === 1
  )!;
  const newer = {
    type: "example.source",
    tauContract: catalog.current(current.type)!.id,
    code: "新源码",
    children: [{ type: "formatted", text: "" }],
  };
  const older = {
    type: "example.source",
    tauContract: oldId,
    source: "旧源码",
    custom: { keep: 7 },
    children: [{ type: "formatted", text: "" }],
  };
  return { catalog, current, older, newer };
}

describe("契约感知的 Markdown 与 HTML 导出", () => {
  it("混合版本只调用匹配 codec，旧节点载荷携带契约并可重开", async () => {
    const { catalog, older, newer } = await setup();
    const serialize = vi.fn(
      (node: { code: string }) => `\`\`\`example-source\n${node.code}\n\`\`\``
    );
    const fallback = vi.fn();
    const processor = await createContractMarkdownProcessor({
      catalog,
      contracts: catalog.dictionary,
      onFallback: fallback,
      codecs: [
        {
          owner: "example",
          codec: {
            type: "example.source",
            fence: { language: "example-source", property: "code" },
            serializer: { toMarkdown: serialize },
          },
        },
      ],
    });
    const markdown = processor.getMarkdown([older, newer] as unknown as Descendant[]);
    expect(serialize).toHaveBeenCalledOnce();
    expect(serialize.mock.calls[0][0]).toMatchObject({ code: "新源码" });
    expect(markdown).toContain("tau.contract-payload");
    expect(fallback).toHaveBeenCalledWith("example.source", "unsupported");
    const restored = await processor.importDocument(markdown);
    expect(restored.content[0]).toEqual(older);
    expect(restored.content[1]).toMatchObject({ code: "新源码", tauContract: newer.tauContract });
    expect(Object.keys(restored.contracts)).toHaveLength(2);
  });

  it("未安装插件时仍能读取无损载荷，不套用当前 codec", async () => {
    const { catalog, older } = await setup();
    const sender = await createContractMarkdownProcessor({
      catalog,
      contracts: catalog.dictionary,
      codecs: [],
    });
    const receiver = await createContractMarkdownProcessor({
      catalog: await ElementContractCatalog.prepare([]),
      contracts: {},
      codecs: [],
    });
    const restored = await receiver.importDocument(
      sender.getMarkdown([older] as unknown as Descendant[])
    );
    expect(restored.content[0]).toEqual(older);
    expect(restored.contracts[older.tauContract]).toEqual(catalog.dictionary[older.tauContract]);
  });

  it("历史导出器的围栏不会抢当前版本的导入语法", async () => {
    const { catalog, older, newer } = await setup();
    const codec = (dataVersion: number, field: string): MarkdownCodec => ({
      type: "example.source",
      dataVersion,
      fence: { language: "example-source", property: field },
      serializer: { toMarkdown: node => `\`\`\`example-source\n${node[field]}\n\`\`\`` },
    });
    const processor = await createContractMarkdownProcessor({
      catalog,
      contracts: catalog.dictionary,
      codecs: [codec(1, "source"), codec(2, "code")].map(codec => ({ owner: "example", codec })),
    });
    const imported = await processor.importDocument(
      processor.getMarkdown([older, newer] as unknown as Descendant[])
    );
    expect(imported.content).toMatchObject([
      { code: "旧源码", tauContract: newer.tauContract },
      { code: "新源码" },
    ]);
  });

  it("导出器抛错后回退原节点，脚注与位置映射不残留半次结果", async () => {
    const { catalog, newer } = await setup();
    const processor = await createContractMarkdownProcessor({
      catalog,
      contracts: catalog.dictionary,
      codecs: [
        {
          owner: "example",
          codec: {
            type: "example.source",
            serializer: {
              toMarkdown() {
                addExportFootnote("不应残留");
                throw new Error("导出失败");
              },
            },
          },
        },
      ],
    });
    const result = processor.getMarkdownWithPositions([newer] as unknown as Descendant[]);
    expect(result.markdown).toContain("tau.contract-payload");
    expect(result.markdown).not.toContain("不应残留");
    expect(result.positionMap.getMappings()).toHaveLength(1);
    expect((await processor.importDocument(result.markdown)).content[0]).toEqual(newer);
  });

  it("HTML 只接受匹配版本，没有历史导出器时明确失败", async () => {
    const { current, older, newer } = await setup();
    const output = vi.fn((node: Record<string, unknown>) => `<pre>${node.code}</pre>`);
    const registry = new ContentPluginRegistry();
    registry.install([
      definePlugin({
        id: "example",
        name: "示例",
        version: "2",
        editorExtensions: [
          defineEditorExtension({
            id: "example",
            elements: [current],
            htmlSerializers: [{ type: "example.source", toHtml: output }],
          }),
        ],
      }),
    ]);
    await registry.prepareContracts();
    const serializer = registry.htmlSerializer("example.source")!;
    expect(() => serializer.toHtml(older)).toThrow("不支持 HTML");
    expect(output).not.toHaveBeenCalled();
    expect(serializer.toHtml(newer)).toBe("<pre>新源码</pre>");
    expect(output).toHaveBeenCalledOnce();
  });
});
