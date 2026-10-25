import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor, type Descendant, type Editor } from "slate";
import { ReactEditor } from "slate-react";

import {
  getEditingContextKey,
  isVoidEditorContext,
  resolveEditingContext,
  resolveVoidEditorContext,
} from "../editingContext";
import { caretInCell, createTableEditor } from "./tableTestUtils";

/** 段落 [0]、代码块 [1]、块公式 [2]、流程图 [3]、含行内公式的段落 [4] */
function createVoidEditor(): Editor {
  const editor = createEditor();
  editor.children = [
    { type: "paragraph", children: [{ type: "formatted", text: "hello" }] },
    {
      type: "code-block",
      uuid: "code-1",
      language: "ts",
      code: "",
      children: [{ type: "formatted", text: "" }],
    },
    { type: "block-math", tex: "x", children: [{ type: "formatted", text: "" }] },
    { type: "mermaid", chart: "", children: [{ type: "formatted", text: "" }] },
    {
      type: "paragraph",
      children: [
        { type: "formatted", text: "a" },
        { type: "inline-math", tex: "y", children: [{ type: "formatted", text: "" }] },
        { type: "formatted", text: "b" },
      ],
    },
  ] as unknown as Descendant[];
  return editor;
}

/** 构造 void 元素 DOM，并让 toSlateNode / findPath 把它映射到 editor 的 path 节点 */
function mountVoidElement(editor: Editor, path: number[], innerHtml: string): HTMLElement {
  const elementDom = document.createElement("div");
  elementDom.setAttribute("data-slate-node", "element");
  elementDom.innerHTML = innerHtml;
  document.body.appendChild(elementDom);
  const node = editor.children[path[0]];
  vi.spyOn(ReactEditor, "toSlateNode").mockImplementation((_, dom) => {
    if (dom !== elementDom) throw new Error("unmapped");
    return node;
  });
  vi.spyOn(ReactEditor, "findPath").mockReturnValue(path);
  return elementDom;
}

function focusIn(element: HTMLElement | null): HTMLElement {
  if (!element) throw new Error("元素不存在");
  if (!element.hasAttribute("tabindex") && !(element instanceof HTMLInputElement)) {
    element.tabIndex = 0;
  }
  element.focus();
  expect(document.activeElement).toBe(element);
  return element;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("resolveEditingContext（选区）", () => {
  it("折叠光标在正文为 text，展开选区为 selection", () => {
    const editor = createTableEditor(2, 2, {
      selection: { anchor: { path: [0, 0], offset: 1 }, focus: { path: [0, 0], offset: 1 } },
    });
    expect(resolveEditingContext(editor, null)).toEqual({ kind: "text" });

    editor.selection = { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 3 } };
    expect(resolveEditingContext(editor, null)).toEqual({ kind: "selection" });

    editor.selection = null;
    expect(resolveEditingContext(editor, null)).toEqual({ kind: "text" });
  });

  it("光标在表格内给出行列与行列数", () => {
    const editor = createTableEditor(3, 4, { selection: caretInCell(2, 1) });
    expect(resolveEditingContext(editor, null)).toEqual({
      kind: "table",
      tablePath: [1],
      row: 2,
      col: 1,
      rowCount: 3,
      colCount: 4,
    });
  });

  it("表格内的展开选区优先按 selection", () => {
    const editor = createTableEditor(2, 2, {
      selection: {
        anchor: { path: [1, 0, 0, 0], offset: 0 },
        focus: { path: [1, 0, 0, 0], offset: 2 },
      },
    });
    expect(resolveEditingContext(editor, null).kind).toBe("selection");
  });

  it("上下文 key：同一表格内不随单元格变化", () => {
    const a = resolveEditingContext(
      createTableEditor(2, 2, { selection: caretInCell(0, 0) }),
      null
    );
    const b = resolveEditingContext(
      createTableEditor(2, 2, { selection: caretInCell(1, 1) }),
      null
    );
    expect(getEditingContextKey(a)).toBe("table:1");
    expect(getEditingContextKey(b)).toBe("table:1");
    expect(getEditingContextKey({ kind: "text" })).toBe("text");
  });
});

describe("resolveVoidEditorContext（焦点）", () => {
  it("代码块 textarea 聚焦为 code，带 uuid 与语言，且优先于展开选区", () => {
    const editor = createVoidEditor();
    editor.selection = { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 3 } };
    const elementDom = mountVoidElement(
      editor,
      [1],
      '<div contenteditable="false"><textarea class="code-block-shiki-input"></textarea></div>'
    );
    const textarea = focusIn(elementDom.querySelector("textarea"));

    const context = resolveEditingContext(editor, textarea);
    expect(context).toMatchObject({
      kind: "code",
      path: [1],
      textarea,
      uuid: "code-1",
      language: "ts",
    });
    expect(isVoidEditorContext(context)).toBe(true);
    expect(getEditingContextKey(context)).toBe("code:1");
  });

  it("块公式原位编辑的输入框聚焦识别，即使与代码块用同一种输入框", () => {
    const editor = createVoidEditor();
    const mathDom = mountVoidElement(
      editor,
      [2],
      '<div class="ed-preview-source"><div class="ed-code-overlay"><textarea class="code-block-shiki-input"></textarea></div></div>'
    );
    const textarea = focusIn(mathDom.querySelector("textarea"));
    const context = resolveVoidEditorContext(editor, textarea);
    expect(context).toMatchObject({ kind: "block-math", path: [2] });
    expect(context && "input" in context ? context.input : null).toBe(textarea);
  });

  it("行内公式弹层输入框按选区所在 inline-math 识别", () => {
    const editor = createVoidEditor();
    const input = document.createElement("input");
    input.setAttribute("data-inline-math-input", "");
    document.body.appendChild(input);
    focusIn(input);

    expect(resolveVoidEditorContext(editor, input)).toBeNull();

    editor.selection = {
      anchor: { path: [4, 1, 0], offset: 0 },
      focus: { path: [4, 1, 0], offset: 0 },
    };
    expect(resolveVoidEditorContext(editor, input)).toEqual({
      kind: "inline-math",
      path: [4, 1],
      input,
    });
  });

  it("不属于当前编辑器、类型不符或只读时不识别", () => {
    const editor = createVoidEditor();
    const other = createVoidEditor();
    const elementDom = document.createElement("div");
    elementDom.setAttribute("data-slate-node", "element");
    elementDom.innerHTML = '<textarea class="code-block-shiki-input"></textarea>';
    document.body.appendChild(elementDom);
    // 节点来自另一个编辑器：path 处的节点不是它
    vi.spyOn(ReactEditor, "toSlateNode").mockReturnValue(other.children[1]);
    vi.spyOn(ReactEditor, "findPath").mockReturnValue([1]);
    const textarea = focusIn(elementDom.querySelector("textarea"));
    expect(resolveVoidEditorContext(editor, textarea)).toBeNull();

    // 类型不符：textarea 映射到段落
    vi.mocked(ReactEditor.toSlateNode).mockReturnValue(editor.children[0]);
    vi.mocked(ReactEditor.findPath).mockReturnValue([0]);
    expect(resolveVoidEditorContext(editor, textarea)).toBeNull();

    vi.mocked(ReactEditor.toSlateNode).mockReturnValue(editor.children[1]);
    vi.mocked(ReactEditor.findPath).mockReturnValue([1]);
    expect(resolveVoidEditorContext(editor, textarea)?.kind).toBe("code");
    vi.spyOn(ReactEditor, "isReadOnly").mockReturnValue(true);
    expect(resolveVoidEditorContext(editor, textarea)).toBeNull();
  });

  it("普通元素聚焦不算 void 编辑器", () => {
    const editor = createVoidEditor();
    const button = document.createElement("button");
    document.body.appendChild(button);
    expect(resolveVoidEditorContext(editor, focusIn(button))).toBeNull();
    expect(resolveVoidEditorContext(editor, null)).toBeNull();
  });
});
