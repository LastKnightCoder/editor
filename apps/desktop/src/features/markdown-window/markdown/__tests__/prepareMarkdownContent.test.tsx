import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it } from "vitest";
import { Editor, createEditorKit, defineExtension, type EditorRef } from "@tau/editor";
import linkExtension from "@tau/editor/extensions/link";
import { tableExtensions } from "@tau/editor/extensions/table";
import { createEditor, type Descendant } from "slate";
import { createMarkdownContentPreparer } from "../prepareMarkdownContent";
import { createMarkdownDocument } from "../markdownDocument";

const kit = createEditorKit({
  extensions: [
    linkExtension,
    ...tableExtensions,
    defineExtension({
      id: "test.void",
      elements: [{ type: "test-void", kind: "block", isVoid: true, render: () => null }],
    }),
  ],
});
const prepare = createMarkdownContentPreparer(kit);
const text = (value: string): Descendant => ({ type: "formatted", text: value });
const link = (): Descendant =>
  ({
    type: "link",
    url: "https://example.com",
    children: [text("链接")],
  }) as unknown as Descendant;
const paragraph = (children: Descendant[]): Descendant =>
  ({ type: "paragraph", children }) as unknown as Descendant;

it("连接时以当前编辑器的 schema 为准，尊重插件改写的 inline 与 void 判定", () => {
  const block = paragraph([link()]);
  const editor = createEditor();
  editor.isInline = () => false;
  expect(prepare([block], editor)[0]).toBe(block);
  editor.isInline = node => node.type === "link";
  editor.isVoid = node => node.type === "paragraph";
  expect(prepare([block], editor)[0]).toBe(block);
});

async function mount(
  content: Descendant[],
  editorDocument?: ReturnType<typeof createMarkdownDocument>["document"]
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host),
    ref = createRef<EditorRef>();
  await act(async () =>
    root.render(
      <DndProvider backend={HTML5Backend}>
        <Editor
          kit={kit}
          ref={ref}
          initValue={content}
          document={editorDocument}
          readonly={false}
        />
      </DndProvider>
    )
  );
  const editor = ref.current?.getEditor();
  if (!editor) throw new Error("编辑器未挂载");
  return {
    editor,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it("只为已声明行内节点补落点，保留输入、未知子树与 void 内容", () => {
  const untouched = paragraph([text("正文")]);
  const unknown = { type: "vendor.block", children: [link()] } as unknown as Descendant;
  const opaque = { type: "test-void", children: [link()] } as unknown as Descendant;
  const input = [untouched, paragraph([link(), link()]), unknown, opaque];
  const original = structuredClone(input);
  const result = prepare(input);
  expect(input).toEqual(original);
  expect(result[0]).toBe(untouched);
  expect(result[2]).toBe(unknown);
  expect(result[3]).toBe(opaque);
  expect(result[1]).toEqual(paragraph([text(""), link(), text(""), link(), text("")]));
  expect(prepare(result)[1]).toBe(result[1]);
});

it("预处理前后经真实编辑器规范化得到相同树，混合格式与表格属性保持一致", async () => {
  const variants = [
    [link()],
    [text("前"), link()],
    [link(), text("后")],
    [link(), link()],
    [text(""), link(), text("")],
    [text("前"), link(), text("中"), link(), text("后")],
    [{ type: "formatted", text: "粗体", bold: true } as Descendant, link()],
  ];
  const content: Descendant[] = [
    ...variants.map(paragraph),
    {
      type: "table",
      align: ["right", null],
      children: variants.map(children => ({
        type: "table-row",
        children: [
          { type: "table-cell", children },
          { type: "table-cell", children: [link(), link()] },
        ],
      })),
    } as Descendant,
    {
      type: "vendor.block",
      payload: { retain: true },
      children: [link()],
    } as unknown as Descendant,
  ];
  const baseline = await mount(content);
  let optimized: Awaited<ReturnType<typeof mount>> | undefined;
  try {
    optimized = await mount(prepare(content));
    expect(optimized.editor.children).toEqual(baseline.editor.children);
  } finally {
    await optimized?.dispose();
    await baseline.dispose();
  }
});

it("原文格式、外部版本和源码撤销重做保持一致", async () => {
  const raw = "| 标题 |\r\n| --- |\r\n| [链接](https://example.com) |\r\n";
  const file = createMarkdownDocument(undefined, prepare);
  file.applyMarkdown(raw, "external");
  const view = await mount([], file.document);
  try {
    expect(file.getText()).toBe(raw);
    const original = structuredClone(view.editor.children);
    await act(async () =>
      file.applyMarkdown("[甲](https://example.com)[乙](https://example.com)", "user")
    );
    const changed = structuredClone(view.editor.children);
    await act(async () => file.undo());
    expect(file.getText()).toBe(raw);
    expect(view.editor.children).toEqual(original);
    await act(async () => file.redo());
    expect(view.editor.children).toEqual(changed);
    await act(async () => file.applyMarkdown(raw, "external"));
    expect(file.getText()).toBe(raw);
    expect(view.editor.children).toEqual(original);
  } finally {
    await view.dispose();
    file.dispose();
  }
});
