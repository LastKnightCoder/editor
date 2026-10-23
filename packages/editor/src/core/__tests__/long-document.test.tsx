import { act, createRef, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit, type EditorRef } from "../index";
import { defineExtension } from "../api";
import { listExtensions } from "../../extensions/list/src";

const metrics = vi.hoisted(() => ({ paragraphCommits: 0, listItemCommits: 0 }));
vi.mock("../extensions/paragraph/components/Paragraph", async importOriginal => {
  const { default: Paragraph } =
    await importOriginal<typeof import("../extensions/paragraph/components/Paragraph")>();
  return {
    default: (props: React.ComponentProps<typeof Paragraph>) => (
      <Profiler id="paragraph" onRender={() => metrics.paragraphCommits++}>
        <Paragraph {...props} />
      </Profiler>
    ),
  };
});
vi.mock(
  "../../extensions/list/src/extensions/list-item/components/ListItem",
  async importOriginal => {
    const { default: ListItem } =
      await importOriginal<
        typeof import("../../extensions/list/src/extensions/list-item/components/ListItem")
      >();
    return {
      default: (props: React.ComponentProps<typeof ListItem>) => (
        <Profiler id="list-item" onRender={() => metrics.listItemCommits++}>
          <ListItem {...props} />
        </Profiler>
      ),
    };
  }
);

it("列表局部输入不重渲染其他项，父列表类型变化仍更新项目符号", async () => {
  const content: Descendant[] = [
    {
      type: "bulleted-list",
      children: Array.from({ length: 100 }, (_, index) => ({
        type: "list-item",
        children: [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: `条目${index}` }],
          },
        ],
      })),
    },
  ];
  const ref = createRef<EditorRef>();
  const kit = createEditorKit({ extensions: listExtensions });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor ref={ref} kit={kit} initValue={content} readonly={false} />
        </DndProvider>
      )
    );
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("编辑器未挂载");
    metrics.listItemCommits = 0;
    await act(async () => Transforms.select(editor, { path: [0, 0, 0, 0], offset: 1 }));
    expect(metrics.listItemCommits).toBe(0);
    await act(async () => editor.insertText("新"));
    expect(metrics.listItemCommits).toBe(1);
    expect(host.querySelectorAll("li > div.absolute[contenteditable=false]")).toHaveLength(100);
    await act(async () => Transforms.setNodes(editor, { type: "numbered-list" }, { at: [0] }));
    expect(host.querySelectorAll("li > div.absolute[contenteditable=false]")).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("增删与跨容器移动后，段落仍正确跟踪末尾间距", async () => {
  const paragraph = (text: string) => ({
    type: "paragraph" as const,
    children: [{ type: "formatted" as const, text }],
  });
  const content: Descendant[] = [
    paragraph("甲"),
    paragraph("乙"),
    { type: "blockquote", children: [paragraph("丙"), paragraph("丁")] },
  ];
  const kit = createEditorKit({
    extensions: [
      defineExtension({
        id: "test.container",
        elements: [
          {
            type: "blockquote",
            kind: "block",
            render: ({ attributes, children }) => (
              <blockquote {...attributes}>{children}</blockquote>
            ),
          },
        ],
      }),
    ],
  });
  const ref = createRef<EditorRef>();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const lastParagraphs = () =>
    [...host.querySelectorAll("p")]
      .filter(node => node.classList.contains("mb-0!"))
      .map(node => node.textContent);
  try {
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor ref={ref} kit={kit} initValue={content} readonly={false} />
        </DndProvider>
      )
    );
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("编辑器未挂载");
    expect(lastParagraphs()).toEqual(["丁"]);
    await act(async () => Transforms.insertNodes(editor, paragraph("戊"), { at: [3] }));
    expect(lastParagraphs()).toEqual(["丁", "戊"]);
    await act(async () => Transforms.removeNodes(editor, { at: [2, 1] }));
    expect(lastParagraphs()).toEqual(["丙", "戊"]);
    await act(async () => Transforms.moveNodes(editor, { at: [3], to: [2, 1] }));
    expect(lastParagraphs()).toEqual(["戊"]);
    await act(async () => Transforms.moveNodes(editor, { at: [2], to: [0] }));
    expect(lastParagraphs()).toEqual(["戊", "乙"]);
    await act(async () => Transforms.insertNodes(editor, paragraph("己"), { at: [0, 2] }));
    expect(lastParagraphs()).toEqual(["己", "乙"]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

afterEach(() => vi.restoreAllMocks());

it("五万字正文的局部输入与选区变化不重渲染无关段落、不序列化全文", async () => {
  const content: Descendant[] = Array.from({ length: 500 }, (_, index) => ({
    type: "paragraph",
    children: [{ type: "formatted", text: `${index}`.padEnd(100, "文") }],
  }));
  const kit = createEditorKit();
  const ref = createRef<EditorRef>();
  const onChange = vi.fn();
  const onSelectionChange = vi.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor
            ref={ref}
            kit={kit}
            initValue={content}
            readonly={false}
            onChange={onChange}
            onSelectionChange={onSelectionChange}
          />
        </DndProvider>
      )
    );
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("编辑器未挂载");
    const stringify = vi.spyOn(JSON, "stringify");
    metrics.paragraphCommits = 0;
    const selectionStart = performance.now();
    await act(async () => Transforms.select(editor, { path: [0, 0], offset: 1 }));
    const selectionMs = performance.now() - selectionStart;
    const selectionCommits = metrics.paragraphCommits;
    const selectionSerializations = stringify.mock.calls.filter(
      ([value]) => Array.isArray(value) && value.length === content.length
    ).length;
    const selectionChanges = onChange.mock.calls.length;
    stringify.mockClear();
    metrics.paragraphCommits = 0;
    const inputStart = performance.now();
    await act(async () => editor.insertText("新"));
    const inputMs = performance.now() - inputStart;
    const inputCommits = metrics.paragraphCommits;
    const inputSerializations = stringify.mock.calls.filter(
      ([value]) => Array.isArray(value) && value.length === content.length
    ).length;
    console.info("[long-document]", {
      characters: 50_000,
      selectionMs,
      inputMs,
      selectionCommits,
      inputCommits,
      selectionSerializations,
      inputSerializations,
    });
    expect(selectionCommits).toBe(0);
    expect(inputCommits).toBe(1);
    expect(selectionSerializations).toBe(0);
    expect(inputSerializations).toBe(0);
    expect(selectionChanges).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
