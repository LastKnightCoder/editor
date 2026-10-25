import { afterEach, expect, it, vi } from "vitest";
import { definePlugin, defineEditorElement, defineEditorExtension } from "@tau/plugins";
import { desktopContentPlugins } from "../../../shared/content-plugins";
import { prepareContentMarkdown } from "../../services/editorKit";
import { collectAssetUrls, mapAssetUrls } from "../content-transfer/assets";
import type { Descendant } from "slate";

afterEach(() => desktopContentPlugins.install([]));
it("实际桌面导出按保存契约分发新旧源码，并按该版本收集附件", async () => {
  const previous = defineEditorElement({
    type: "example.diagram",
    dataVersion: 1,
    kind: "block",
    isVoid: true,
    collaboration: { textFields: ["source"] },
    resources: [{ path: "attachment", kind: "file" }],
    render: () => null,
  });
  const current = defineEditorElement({
    type: previous.type,
    dataVersion: 2,
    kind: "block",
    isVoid: true,
    collaboration: { textFields: ["code"] },
    resources: [{ path: "asset", kind: "image" }],
    previousVersions: [{ element: previous, access: "read" }],
    render: () => null,
  });
  const oldExport = vi.fn((node: Record<string, unknown>) => String(node.source));
  const newExport = vi.fn((node: Record<string, unknown>) => String(node.code));
  desktopContentPlugins.install([
    definePlugin({
      id: "example",
      name: "示例",
      version: "2",
      editorExtensions: [defineEditorExtension({ id: "example", elements: [current] })],
      editorCodecs: [
        { type: current.type, dataVersion: 1, serializer: { toMarkdown: oldExport } },
        { type: current.type, dataVersion: 2, serializer: { toMarkdown: newExport } },
      ],
    }),
  ]);
  const catalog = await desktopContentPlugins.prepareContracts();
  const oldId = Object.keys(catalog.dictionary).find(
    id => catalog.dictionary[id].dataVersion === 1
  )!;
  const content = [
    {
      type: current.type,
      tauContract: oldId,
      source: "旧源码",
      attachment: "/old.pdf",
      children: [{ text: "" }],
    },
    {
      type: current.type,
      tauContract: catalog.current(current.type)!.id,
      code: "新源码",
      asset: "/new.png",
      children: [{ text: "" }],
    },
  ] as unknown as Descendant[];
  const markdown = (await prepareContentMarkdown(catalog.dictionary)).getMarkdown(content);
  const { splitSections } = await import("../../entity/sections");
  const processor = await prepareContentMarkdown(catalog.dictionary);
  const sections = splitSections(content, "版本索引", false, undefined, nodes =>
    processor.getMarkdown(nodes)
  );
  expect(sections.map(section => section.text).join("\n")).toContain("旧源码");
  expect(sections.map(section => section.text).join("\n")).toContain("新源码");
  expect(markdown).toContain("旧源码");
  expect(markdown).toContain("新源码");
  expect(oldExport).toHaveBeenCalledTimes(2);
  expect(newExport).toHaveBeenCalledTimes(2);
  expect(collectAssetUrls(content, {}, catalog.dictionary)).toEqual([
    { url: "/old.pdf", kind: "file" },
    { url: "/new.png", kind: "image" },
  ]);
  const mapped = mapAssetUrls(
    content,
    url => `assets/${url.slice(1)}`,
    { contracts: catalog.dictionary },
    {}
  );
  expect(mapped[0]).toHaveProperty("attachment", "assets/old.pdf");
  expect(mapped[1]).toHaveProperty("asset", "assets/new.png");
  desktopContentPlugins.install([]);
  const unavailable = await prepareContentMarkdown(catalog.dictionary);
  const preserved = unavailable.getMarkdown(content);
  expect(preserved).toContain("tau.contract-payload");
  expect((await unavailable.importDocument(preserved)).content).toEqual(content);
});

it("HTML 按保存版本分发，缺失插件时拒绝丢失，代码步骤逐步导出", async () => {
  await (
    await import("../../stores/useDynamicExtensionsStore")
  ).default
    .getState()
    .initExtensions();
  const { htmlSerializerRegistry } = await import("../html-serializers");
  const { prepareNewContent } = await import("../../services/editorKit");
  const previous = defineEditorElement({
    type: "example.html",
    dataVersion: 1,
    kind: "block",
    isVoid: true,
    collaboration: { textFields: ["source"] },
    render: () => null,
  });
  const current = defineEditorElement({
    ...previous,
    dataVersion: 2,
    collaboration: { textFields: ["code"] },
    previousVersions: [{ element: previous, access: "read" }],
  });
  const oldExport = vi.fn((node: Record<string, unknown>) => `<pre>${node.source}</pre>`);
  const newExport = vi.fn((node: Record<string, unknown>) => `<pre>${node.code}</pre>`);
  desktopContentPlugins.install([
    definePlugin({
      id: "example",
      name: "示例",
      version: "2",
      editorExtensions: [
        defineEditorExtension({
          id: "example",
          elements: [current],
          htmlSerializers: [
            { type: current.type, dataVersion: 1, toHtml: oldExport },
            { type: current.type, dataVersion: 2, toHtml: newExport },
          ],
        }),
      ],
    }),
  ]);
  const catalog = await desktopContentPlugins.prepareContracts();
  const oldId = Object.keys(catalog.dictionary).find(
    id => catalog.dictionary[id].dataVersion === 1
  )!;
  const content = [
    {
      type: current.type,
      tauContract: oldId,
      source: "旧源码",
      children: [{ type: "formatted", text: "" }],
    },
    {
      type: current.type,
      tauContract: catalog.current(current.type)!.id,
      code: "新源码",
      children: [{ type: "formatted", text: "" }],
    },
  ] as unknown as Descendant[];
  expect(await htmlSerializerRegistry.serializeAsync(content)).toContain("旧源码");
  expect(oldExport).toHaveBeenCalledOnce();
  expect(newExport).toHaveBeenCalledOnce();
  const { buildEpubExportPayloadFromSlate } = await import("../epub-export");
  const input = {
    content,
    metadata: { title: "混合版本", author: "测试", language: "zh-CN", description: "" },
  };
  const epub = await buildEpubExportPayloadFromSlate(input);
  const chapters = epub.payload.chapters.map(chapter => chapter.xhtml).join("\n");
  expect(chapters).toContain("旧源码");
  expect(chapters).toContain("新源码");
  desktopContentPlugins.install([]);
  await expect(htmlSerializerRegistry.serializeAsync(content)).rejects.toThrow("版本");
  await expect(buildEpubExportPayloadFromSlate(input)).rejects.toThrow("版本");
  const prepared = await prepareNewContent([
    {
      type: "code-block",
      language: "text",
      children: [
        { type: "code-step", code: "first-step", children: [{ type: "formatted", text: "" }] },
        { type: "code-step", code: "second-step", children: [{ type: "formatted", text: "" }] },
      ],
    },
  ] as unknown as Descendant[]);
  const html = await htmlSerializerRegistry.serializeAsync(prepared.content);
  expect(html).toContain("first-step");
  expect(html).toContain("second-step");
}, 20000);

it("无损载荷在文件窗口重开和修改源码后仍可导入原版本", async () => {
  const { createMarkdownDocument } =
    await import("../../features/markdown-window/markdown/markdownDocument");
  const { prepareContentContract } = await import("@tau/db-schema/content-contracts");
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const previous = await prepareContentContract("missing.plugin", {
    type: "missing.source",
    dataVersion: 1,
    kind: "block",
    isVoid: true,
    collaboration: { textFields: ["source"] },
  });
  desktopContentPlugins.install([
    definePlugin({
      id: "missing.plugin",
      name: "测试",
      version: "1",
      editorExtensions: [
        defineEditorExtension({
          id: "missing.source",
          elements: [
            defineEditorElement({
              type: "missing.source",
              dataVersion: 1,
              kind: "block",
              isVoid: true,
              collaboration: { textFields: ["source"] },
              render: () => null,
            }),
          ],
        }),
      ],
    }),
  ]);
  const processor = await prepareContentMarkdown({ [previous.id]: previous.contract });
  const content = [
    {
      type: "missing.source",
      tauContract: previous.id,
      source: "原始源码",
      unknown: { keep: true },
      children: [{ type: "formatted", text: "" }],
    },
  ] as unknown as Descendant[];
  const raw = processor.getMarkdown(content);
  let file = createMarkdownDocument();
  const directory = await mkdtemp(join(tmpdir(), "tau-contract-markdown-"));
  const path = join(directory, "document.md");
  try {
    expect(file.applyMarkdown(raw, "external")).toBe(true);
    expect(file.getText()).toBe(raw);
    await writeFile(path, file.getText(), "utf8");
    file.dispose();
    desktopContentPlugins.install([]);
    file = createMarkdownDocument();
    expect(file.applyMarkdown(await readFile(path, "utf8"), "external")).toBe(true);
    expect(file.applyMarkdown(raw + "\n\n新增段落", "user")).toBe(true);
    await writeFile(path, file.getText(), "utf8");
    const reader = await prepareContentMarkdown({ [previous.id]: previous.contract });
    const recovered = await reader.importDocument(await readFile(path, "utf8"));
    expect(recovered.content[0]).toEqual(content[0]);
    expect(recovered.contracts[previous.id]).toEqual(previous.contract);
    expect(JSON.stringify(recovered.content)).toContain("新增段落");
  } finally {
    file.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
