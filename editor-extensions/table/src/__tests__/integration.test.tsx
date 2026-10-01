import { act, createRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Editor as SlateEditor, Node, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it } from "vitest";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { IOverlayBackDismiss, type OverlayBackDismissProps } from "@tau/editor/api";
import {
  tableExtensions,
  insertTable,
  insertRowAfter,
  insertColRight,
  deleteRowByIndex,
  deleteColByIndex,
  moveNextCol,
  type TableElement,
} from "../index";
import { moveTableRow } from "../rowDrag";

const paragraph = () => ({
  type: "paragraph" as const,
  children: [{ type: "formatted" as const, text: "" }],
});
const table = (): TableElement => ({
  type: "table",
  children: ["标题", "正文"].map(text => ({
    type: "table-row",
    children: [text, text + "2"].map(text => ({
      type: "table-cell",
      children: [{ type: "formatted", text }],
    })),
  })),
});

async function mount(value: Descendant[], readonly = false) {
  const dismissals = new Set<() => void>();
  function Layer({ onDismiss }: OverlayBackDismissProps) {
    useEffect(() => {
      dismissals.add(onDismiss);
      return () => {
        dismissals.delete(onDismiss);
      };
    }, [onDismiss]);
    return null;
  }
  const kit = createEditorKit({
    extensions: tableExtensions,
    services: [register => register(IOverlayBackDismiss, { Layer })],
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host),
    ref = createRef<EditorRef>();
  await act(async () =>
    root.render(
      <DndProvider backend={HTML5Backend}>
        <Editor ref={ref} kit={kit} initValue={value} readonly={readonly} />
      </DndProvider>
    )
  );
  const editor = ref.current?.getEditor();
  if (!editor) throw new Error("编辑器未挂载");
  return {
    editor,
    host,
    dismissals,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it("独立表格可插入、增删行列并在最后一列删除后回到段落", async () => {
  const view = await mount([paragraph()]);
  try {
    await act(async () => {
      Transforms.select(view.editor, { path: [0, 0], offset: 0 });
      insertTable(view.editor, 2, 2);
    });
    expect(view.editor.selection?.anchor.path).toEqual([0, 0, 0, 0]);
    await act(async () => insertRowAfter(view.editor));
    await act(async () => insertColRight(view.editor));
    expect((view.editor.children[0] as TableElement).children).toHaveLength(3);
    expect((view.editor.children[0] as TableElement).children[0].children).toHaveLength(3);
    await act(async () => deleteRowByIndex(view.editor, 1));
    expect((view.editor.children[0] as TableElement).children).toHaveLength(2);
    for (let index = 0; index < 3; index++) await act(async () => deleteColByIndex(view.editor, 0));
    expect(view.editor.children).toEqual([paragraph()]);
    expect(view.editor.selection?.anchor.path).toEqual([0, 0]);
  } finally {
    await view.dispose();
  }
});

it("单元格回车保留结构，跨末格导航有段落落点，行手柄在合法单元格内", async () => {
  const view = await mount([table()]);
  try {
    for (const row of view.host.querySelectorAll("tr")) {
      expect([...row.children].every(child => child.tagName === "TD")).toBe(true);
      expect(row.querySelector("td [data-drag-handle]")).toBeTruthy();
    }
    await act(async () => {
      Transforms.select(view.editor, SlateEditor.end(view.editor, [0, 1, 1]));
      view.editor.insertBreak();
    });
    expect(view.editor.children).toHaveLength(1);
    await act(async () => moveNextCol(view.editor));
    expect(view.editor.children[1]).toEqual(paragraph());
    expect(view.editor.selection?.anchor.path).toEqual([1, 0]);
  } finally {
    await view.dispose();
  }
});

it("只读与无选区操作不写入，非法表格尺寸不破坏原内容", async () => {
  const view = await mount([table()], true);
  try {
    await act(async () =>
      Transforms.select(view.editor, SlateEditor.start(view.editor, [0, 1, 0]))
    );
    const before = JSON.stringify(view.editor.children);
    await act(async () => {
      insertRowAfter(view.editor);
      insertColRight(view.editor);
      deleteRowByIndex(view.editor, 1);
      deleteColByIndex(view.editor, 0);
      insertTable(view.editor, 2, 2);
    });
    expect(JSON.stringify(view.editor.children)).toBe(before);
  } finally {
    await view.dispose();
  }
  const editable = await mount([paragraph()]);
  try {
    await act(async () => insertTable(editable.editor, 2, 2));
    expect(editable.editor.children).toEqual([paragraph()]);
    await act(async () => {
      Transforms.select(editable.editor, { path: [0, 0], offset: 0 });
      insertTable(editable.editor, 0, 2);
      insertTable(editable.editor, NaN, 2);
    });
    expect(editable.editor.children).toEqual([paragraph()]);
  } finally {
    await editable.dispose();
  }
});

it("两张表仅当前表格的菜单生效，浮层可经宿主返回关闭", async () => {
  const view = await mount([table(), table()]);
  try {
    await act(async () =>
      Transforms.select(view.editor, SlateEditor.start(view.editor, [1, 1, 0]))
    );
    const menus = [...view.host.querySelectorAll(".lucide-ellipsis-vertical")].map(
      icon => icon.parentElement
    );
    expect(menus).toHaveLength(2);
    await act(async () => menus[0]?.click());
    expect(view.dismissals.size).toBe(0);
    await act(async () => menus[1]?.click());
    expect(view.dismissals.size).toBe(1);
    await act(async () => [...view.dismissals][0]());
    expect(view.dismissals.size).toBe(0);
    expect(Node.string(view.editor)).toContain("正文");
  } finally {
    await view.dispose();
  }
});

it("行拖拽重新定位节点，拒绝已删除来源、跨表和标题行", async () => {
  const first = table();
  first.children.push({
    ...first.children[1],
    children: [{ type: "table-cell", children: [{ type: "formatted", text: "第三行" }] }],
  });
  const view = await mount([first, table()]);
  try {
    const current = view.editor.children[0] as TableElement;
    const [heading, source, target] = current.children;
    const other = (view.editor.children[1] as TableElement).children[1];
    await act(async () => {
      expect(moveTableRow(view.editor, view.editor, heading, target, false)).toBe(false);
      expect(moveTableRow(view.editor, view.editor, source, other, false)).toBe(false);
      Transforms.insertNodes(view.editor, table().children[1], { at: [0, 1] });
    });
    await act(async () =>
      expect(moveTableRow(view.editor, view.editor, source, target, false)).toBe(true)
    );
    expect(Node.get(view.editor, [0, 3])).toBe(source);
    await act(async () => Transforms.removeNodes(view.editor, { at: [0, 3] }));
    const before = JSON.stringify(view.editor.children);
    await act(async () =>
      expect(moveTableRow(view.editor, view.editor, source, target, true)).toBe(false)
    );
    expect(JSON.stringify(view.editor.children)).toBe(before);
  } finally {
    await view.dispose();
  }
});
