import { act, createRef, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor as SlateEditor, Transforms, type Descendant } from "slate";
import { expect, it, vi } from "vitest";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { tableExtensions } from "../index";
import { selectCells, selectRows } from "../selection";

const metrics = vi.hoisted(() => new Map<string, number>());
vi.mock("../components/Table", async importOriginal => {
  const { default: Table } = await importOriginal<typeof import("../components/Table")>();
  return {
    default: (props: React.ComponentProps<typeof Table>) => (
      <Profiler
        id={String((props.element as typeof props.element & { testId?: string }).testId)}
        onRender={id => metrics.set(id, (metrics.get(id) ?? 0) + 1)}
      >
        <Table {...props} />
      </Profiler>
    ),
  };
});

Range.prototype.getBoundingClientRect ??= () => new DOMRect();

it("正文输入与光标移动不提交无关表格，格选区只更新所属表格", async () => {
  const content: Descendant[] = [
    { type: "paragraph", children: [{ type: "formatted", text: "正文" }] },
    ...Array.from({ length: 80 }, (_, index) => ({
      type: "table" as const,
      testId: String(index),
      children: Array.from({ length: 2 }, () => ({
        type: "table-row" as const,
        children: Array.from({ length: 2 }, () => ({
          type: "table-cell" as const,
          children: [{ type: "formatted" as const, text: "单元格" }],
        })),
      })),
    })),
  ];
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host),
    ref = createRef<EditorRef>();
  try {
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor
            ref={ref}
            kit={createEditorKit({ extensions: tableExtensions })}
            initValue={content}
            readonly={false}
          />
        </DndProvider>
      )
    );
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("编辑器未挂载");
    metrics.clear();
    await act(async () => Transforms.select(editor, { path: [0, 0], offset: 1 }));
    await act(async () => editor.insertText("新"));
    await act(async () => Transforms.select(editor, { path: [0, 0], offset: 0 }));
    expect([...metrics.keys()]).toEqual([]);

    await act(async () =>
      selectCells(editor, [1], { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 })
    );
    expect([...metrics.keys()]).toEqual(["0"]);
    expect(host.querySelectorAll("table.caret-transparent")).toHaveLength(1);
    metrics.clear();
    await act(async () => selectRows(editor, [2], 0));
    expect([...metrics.keys()].sort()).toEqual(["0", "1"]);
    expect(host.querySelectorAll("table.caret-transparent")).toHaveLength(1);

    metrics.clear();
    await act(async () => Transforms.select(editor, SlateEditor.start(editor, [0])));
    expect([...metrics.keys()]).toEqual(["1"]);
    expect(host.querySelectorAll("table.caret-transparent")).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
