import { describe, expect, it } from "vitest";
import { createEditor, type Descendant, type Editor, type Element } from "slate";
import { focusPathOf, focusRoleOf } from "../focusPath";

const text = (value: string) => ({ type: "formatted", text: value });
const block = (type: string, children: unknown[]) => ({ type, children });
const para = (value: string) => block("paragraph", [text(value)]);

function editorWith(children: unknown[]): Editor {
  const editor = createEditor();
  editor.isInline = element => element.type === "link";
  editor.children = children as Descendant[];
  return editor;
}

describe("focusPathOf", () => {
  it("顶层段落：链上只有它自己，也是聚焦单元", () => {
    const editor = editorWith([para("一"), para("二")]);
    expect(focusPathOf(editor, [1, 0])).toEqual({ path: [[1]], unit: [1] });
  });

  it("列表项里的段落：列表与列表项在链上，聚焦单元是段落", () => {
    const list = block("bulleted-list", [
      block("list-item", [para("一")]),
      block("list-item", [para("二"), block("bulleted-list", [block("list-item", [para("子")])])]),
    ]);
    const editor = editorWith([para("前"), list]);
    expect(focusPathOf(editor, [1, 1, 0, 0])).toEqual({
      path: [[1], [1, 1], [1, 1, 0]],
      unit: [1, 1, 0],
    });
  });

  it("表格单元格：行、单元格在链上，其余行 / 单元格在链外", () => {
    const table = block("table", [
      block("table-row", [block("table-cell", [para("a")]), block("table-cell", [para("b")])]),
    ]);
    const editor = editorWith([table]);
    expect(focusPathOf(editor, [0, 0, 1, 0, 0]).unit).toEqual([0, 0, 1, 0]);
    expect(focusPathOf(editor, [0, 0, 1, 0, 0]).path).toHaveLength(4);
  });

  it("行内元素在链上，但聚焦单元仍是它所在的块", () => {
    const editor = editorWith([block("paragraph", [text("前"), block("link", [text("链接")])])]);
    expect(focusPathOf(editor, [0, 1, 0])).toEqual({ path: [[0], [0, 1]], unit: [0] });
  });

  it("没有选区或路径已失效时为空", () => {
    const editor = editorWith([para("一")]);
    expect(focusPathOf(editor, undefined)).toEqual({ path: [], unit: null });
    expect(focusPathOf(editor, [5, 0])).toEqual({ path: [], unit: null });
  });
});

describe("focusRoleOf", () => {
  it("按节点身份：聚焦单元 / 链上祖先 / 链外兄弟", () => {
    const editor = editorWith([para("前"), block("blockquote", [para("一"), para("二")])]);
    const at = [1, 1, 0];
    const [first, quote] = editor.children as Element[];
    const [quoteFirst, quoteSecond] = quote.children as Element[];
    expect(focusRoleOf(editor, quoteSecond, at)).toBe("unit");
    expect(focusRoleOf(editor, quote, at)).toBe("path");
    expect(focusRoleOf(editor, quoteFirst, at)).toBeNull();
    expect(focusRoleOf(editor, first, at)).toBeNull();
    expect(focusRoleOf(editor, first, null)).toBeNull();
  });

  it("结构相同但不是当前文档里的节点对象，视为链外", () => {
    const editor = editorWith([para("一")]);
    const lookalike = structuredClone(editor.children[0]) as Element;
    expect(focusRoleOf(editor, lookalike, [0, 0])).toBeNull();
  });
});
