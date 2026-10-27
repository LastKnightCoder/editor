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
  insertRows,
  insertColumns,
  deleteRows,
  deleteColumns,
  setColumnAlign,
  getCellSelection,
  type TableElement,
} from "../index";

// jsdom 的 Range 没有布局方法；格选区会触发核心悬浮工具条定位
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

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

const tableAt = (editor: SlateEditor, index = 0) => editor.children[index] as TableElement;
const hoverCell = async (host: HTMLElement, row: number, col: number) => {
  const cell = host.querySelectorAll("tr")[row].querySelectorAll("td")[col];
  await act(async () => {
    cell.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
  });
};

it("插入表格后按下标增删行列，一次操作一步撤销，删光回到段落", async () => {
  const view = await mount([paragraph()]);
  try {
    await act(async () => {
      Transforms.select(view.editor, { path: [0, 0], offset: 0 });
      insertTable(view.editor, 2, 2);
    });
    expect(view.editor.selection?.anchor.path).toEqual([0, 0, 0, 0]);
    await act(async () => insertRows(view.editor, [0], 2));
    await act(async () => insertColumns(view.editor, [0], 2));
    expect(tableAt(view.editor).children).toHaveLength(3);
    expect(tableAt(view.editor).children[0].children).toHaveLength(3);
    await act(async () => view.editor.undo());
    expect(tableAt(view.editor).children[0].children).toHaveLength(2);
    await act(async () => deleteRows(view.editor, [0], 1));
    expect(tableAt(view.editor).children).toHaveLength(2);
    await act(async () => deleteColumns(view.editor, [0], 0, 1));
    expect(view.editor.children).toEqual([paragraph()]);
    expect(view.editor.selection?.anchor.path).toEqual([0, 0]);
  } finally {
    await view.dispose();
  }
});

it("加载时补齐缺格；列对齐渲染到单元格", async () => {
  const ragged = table();
  ragged.children[1].children.pop();
  ragged.align = [null, "right"];
  const view = await mount([ragged]);
  try {
    expect(tableAt(view.editor).children[1].children).toHaveLength(2);
    const cells = view.host.querySelectorAll("tr")[0].querySelectorAll("td");
    expect(cells[1].style.textAlign).toBe("right");
    await act(async () => setColumnAlign(view.editor, [0], 0, 0, "center"));
    expect(view.host.querySelectorAll("td")[0].style.textAlign).toBe("center");
  } finally {
    await view.dispose();
  }
});

it("Tab / Enter / 方向键在格间导航，末行回车新增行，末行下移跳出表格", async () => {
  const view = await mount([table()]);
  try {
    Transforms.select(view.editor, SlateEditor.end(view.editor, [0, 0, 1]));
    expect(view.editor.commands?.execute("tau.table.next-cell")).toBe(true);
    expect(view.editor.selection?.anchor.path.slice(0, 3)).toEqual([0, 1, 0]);
    await act(async () => view.editor.commands?.execute("tau.table.next-row"));
    expect(tableAt(view.editor).children).toHaveLength(3);
    expect(view.editor.selection?.anchor.path.slice(0, 3)).toEqual([0, 2, 0]);
    await act(async () => {
      view.editor.insertBreak();
    });
    expect(view.editor.children).toHaveLength(1);
    await act(async () => view.editor.commands?.execute("tau.table.move-down"));
    expect(view.editor.children[1]).toEqual(paragraph());
    expect(view.editor.selection?.anchor.path).toEqual([1, 0]);
  } finally {
    await view.dispose();
  }
});

it("只读时变换不写入、不渲染手柄，非法表格尺寸不破坏原内容", async () => {
  const view = await mount([table()], true);
  try {
    await act(async () =>
      Transforms.select(view.editor, SlateEditor.start(view.editor, [0, 1, 0]))
    );
    const before = JSON.stringify(view.editor.children);
    await act(async () => {
      insertRows(view.editor, [0], 1);
      insertColumns(view.editor, [0], 1);
      deleteRows(view.editor, [0], 1);
      deleteColumns(view.editor, [0], 0);
      insertTable(view.editor, 2, 2);
    });
    expect(JSON.stringify(view.editor.children)).toBe(before);
    await hoverCell(view.host, 1, 0);
    expect(view.host.querySelector('[aria-label="列操作"]')).toBeNull();
    expect(view.host.querySelector('[aria-label="添加行"]')).toBeNull();
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

it("悬停出现行列手柄；点击选中整列并打开菜单，菜单内 ⌫ 删除该列，浮层经宿主返回关闭", async () => {
  const view = await mount([table(), table()]);
  try {
    await hoverCell(view.host, 1, 1);
    const grips = view.host.querySelectorAll<HTMLButtonElement>('[aria-label="列操作"]');
    expect(grips).toHaveLength(1);
    expect(view.host.querySelectorAll('[aria-label="行操作"]')).toHaveLength(1);

    await act(async () => grips[0].click());
    expect(view.dismissals.size).toBe(1);
    expect(getCellSelection(view.editor)).toMatchObject({
      tablePath: [0],
      kind: "col",
      colStart: 1,
    });
    expect(document.body.textContent).toContain("在右侧插入列");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
    });
    expect(tableAt(view.editor).children[0].children).toHaveLength(1);
    expect(tableAt(view.editor, 1).children[0].children).toHaveLength(2);
    expect(view.dismissals.size).toBe(0);

    await hoverCell(view.host, 1, 0);
    const rowGrip = view.host.querySelector<HTMLButtonElement>('[aria-label="行操作"]');
    await act(async () => rowGrip?.click());
    expect(view.dismissals.size).toBe(1);
    await act(async () => [...view.dismissals][0]());
    expect(view.dismissals.size).toBe(0);
    expect(Node.string(view.editor)).toContain("正文");
  } finally {
    await view.dispose();
  }
});

it("右侧 / 底部「+」追加列与行", async () => {
  const view = await mount([table()]);
  try {
    await act(async () =>
      view.host.querySelector<HTMLButtonElement>('[aria-label="添加列"]')?.click()
    );
    await act(async () =>
      view.host.querySelector<HTMLButtonElement>('[aria-label="添加行"]')?.click()
    );
    expect(tableAt(view.editor).children).toHaveLength(3);
    expect(tableAt(view.editor).children.every(row => row.children.length === 3)).toBe(true);
    expect(view.editor.selection?.anchor.path.slice(0, 3)).toEqual([0, 2, 0]);
  } finally {
    await view.dispose();
  }
});

it("表格下方的 AddParagraph 可在表格后插入段落", async () => {
  const view = await mount([table()]);
  try {
    const addParagraph = view.host.querySelector<HTMLElement>(".h-\\(--block-distance\\)");
    expect(addParagraph?.closest("table")).toBeNull();
    await act(async () => addParagraph?.click());
    expect(view.editor.children).toHaveLength(2);
    expect(view.editor.children[1]).toEqual(paragraph());
    expect(view.editor.selection?.anchor.path).toEqual([1, 0]);
  } finally {
    await view.dispose();
  }
});
