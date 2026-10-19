import { createEditor, Descendant, Editor, Transforms } from "slate";
import { describe, expect, it } from "vitest";

import { withCaretAffinity } from "../../plugins/withCaretAffinity";
import { getCaretAffinity, getCaretSlots, moveCaret } from "../caretAffinity";

const text = (value: string, marks: Record<string, unknown> = {}) => ({
  type: "formatted" as const,
  text: value,
  ...marks,
});

const paragraph = (...children: unknown[]) => ({ type: "paragraph", children }) as Descendant;

const createTestEditor = (...children: unknown[]) => {
  const editor = withCaretAffinity(createEditor(), () => new Set(["code"]));
  const { isInline, isVoid } = editor;
  editor.isInline = element => ["link", "inline-math"].includes(element.type) || isInline(element);
  editor.isVoid = element => (element.type as string) === "inline-math" || isVoid(element);
  editor.children = [paragraph(...children)];
  return editor;
};

const point = (path: number[], offset: number) => ({ path: [0, ...path], offset });

const state = (editor: Editor) => ({
  anchor: editor.selection?.anchor,
  marks: editor.marks,
  side: getCaretAffinity(editor),
});

describe("getCaretSlots", () => {
  it("文本中间只有一个槽位", () => {
    const editor = createTestEditor(text("abcd"));
    expect(getCaretSlots(editor, point([0], 2))?.slots).toHaveLength(1);
  });

  it("右侧带标记时两侧都是真实落点（右侧文本开头有 spacer）", () => {
    const editor = createTestEditor(text("ab"), text("cd", { bold: true }));
    const slots = getCaretSlots(editor, point([1], 0))!.slots;
    expect(slots.map(slot => [slot.point, slot.pending])).toEqual([
      [point([0], 2), undefined],
      [point([1], 0), undefined],
    ]);
  });

  it("右侧无标记时挂在左侧文本末尾，以待插入标记表达", () => {
    const editor = createTestEditor(text("ab", { bold: true }), text("cd"));
    const slots = getCaretSlots(editor, point([1], 0))!.slots;
    expect(slots.map(slot => [slot.point, slot.pending])).toEqual([
      [point([0], 2), undefined],
      [point([0], 2), { type: "formatted" }],
    ]);
  });

  it("块末尾的格式补出无格式槽位", () => {
    const editor = createTestEditor(text("ab", { bold: true }));
    const slots = getCaretSlots(editor, point([0], 2))!.slots;
    expect(slots.map(slot => slot.pending)).toEqual([undefined, { type: "formatted" }]);
  });

  it("行内 void 两侧不是同一位置", () => {
    const editor = createTestEditor(
      text("ab"),
      { type: "inline-math", tex: "x", children: [text("")] },
      text("cd")
    );
    expect(getCaretSlots(editor, point([0], 2))?.slots).toHaveLength(1);
  });
});

describe("默认归位", () => {
  it("普通标记末尾沿用左侧格式", () => {
    const editor = createTestEditor(text("ab", { bold: true }), text("cd"));
    Transforms.select(editor, point([1], 0));
    expect(state(editor)).toEqual({ anchor: point([0], 2), marks: null, side: "left" });
  });

  it("行内代码末尾默认落在外侧", () => {
    const editor = createTestEditor(text("ab", { code: true }), text("cd"));
    Transforms.select(editor, point([0], 2));
    expect(state(editor)).toEqual({
      anchor: point([0], 2),
      marks: { type: "formatted" },
      side: "right",
    });
  });

  it("行内代码开头默认落在外侧（左）", () => {
    const editor = createTestEditor(text("ab"), text("cd", { code: true }));
    Transforms.select(editor, point([1], 0));
    expect(state(editor)).toEqual({ anchor: point([0], 2), marks: null, side: "left" });
  });

  it("段末的行内代码默认跳出，段首的加粗默认沿用", () => {
    const code = createTestEditor(text("ab", { code: true }));
    Transforms.select(code, point([0], 2));
    expect(state(code).side).toBe("right");

    const bold = createTestEditor(text("ab", { bold: true }));
    Transforms.select(bold, point([0], 0));
    expect(state(bold)).toEqual({ anchor: point([0], 0), marks: null, side: "right" });
  });

  it("链接末尾默认落在链接外", () => {
    const editor = createTestEditor(
      text("ab"),
      { type: "link", url: "u", children: [text("cd")] },
      text("")
    );
    Transforms.select(editor, point([1, 0], 2));
    expect(state(editor)).toEqual({ anchor: point([2], 0), marks: null, side: "right" });
  });
});

describe("moveCaret 两步移动", () => {
  it("向右越过标记边界：先停左侧，再切右侧，再进入", () => {
    const editor = createTestEditor(text("ab"), text("cd", { bold: true }));
    Transforms.select(editor, point([0], 1));

    expect(moveCaret(editor, false)).toBe(true);
    expect(state(editor)).toEqual({ anchor: point([0], 2), marks: null, side: "left" });

    expect(moveCaret(editor, false)).toBe(true);
    expect(state(editor)).toEqual({ anchor: point([1], 0), marks: null, side: "right" });

    expect(moveCaret(editor, false)).toBe(true);
    expect(state(editor)).toEqual({ anchor: point([1], 1), marks: null, side: null });
  });

  it("向左越过标记边界：先停右侧，再切左侧", () => {
    const editor = createTestEditor(text("ab"), text("cd", { bold: true }));
    Transforms.select(editor, point([1], 1));

    moveCaret(editor, true);
    expect(state(editor).side).toBe("right");
    moveCaret(editor, true);
    expect(state(editor)).toEqual({ anchor: point([0], 2), marks: null, side: "left" });
    moveCaret(editor, true);
    expect(state(editor).anchor).toEqual(point([0], 1));
  });

  it("不涉及边界时交给原生移动", () => {
    const editor = createTestEditor(text("abcd"));
    Transforms.select(editor, point([0], 1));
    expect(moveCaret(editor, false)).toBe(false);
  });

  it("段末最外侧槽位再按右键交给原生（跨块）", () => {
    const editor = createTestEditor(text("ab", { bold: true }));
    Transforms.select(editor, point([0], 2));
    expect(moveCaret(editor, false)).toBe(true);
    expect(state(editor).side).toBe("right");
    expect(moveCaret(editor, false)).toBe(false);
  });

  it("按字形移动，不拆开 emoji", () => {
    const editor = createTestEditor(text("a👍🏽"), text("b", { bold: true }));
    Transforms.select(editor, point([0], 1));
    moveCaret(editor, false);
    expect(state(editor).anchor).toEqual(point([0], 5));
  });

  it("行内元素边界在内外侧之间切换", () => {
    const editor = createTestEditor(
      text("ab"),
      { type: "link", url: "u", children: [text("cd")] },
      text("")
    );
    Transforms.select(editor, point([1, 0], 2));
    expect(state(editor).side).toBe("right");
    moveCaret(editor, true);
    expect(state(editor)).toEqual({ anchor: point([1, 0], 2), marks: null, side: "left" });
  });
});

describe("编辑后保持归属", () => {
  it("退格删掉格式内首字后，光标仍在格式内", () => {
    const editor = createTestEditor(text("ab"), text("xcd", { color: "red" }));
    Transforms.select(editor, point([1], 1));
    Editor.deleteBackward(editor);
    editor.onChange();
    expect(state(editor)).toEqual({ anchor: point([1], 0), marks: null, side: "right" });
    Editor.insertText(editor, "y");
    expect(editor.children).toEqual([paragraph(text("ab"), text("ycd", { color: "red" }))]);
  });

  it("退格删掉格式后无格式文本的首字，光标换成无格式槽位", () => {
    const editor = createTestEditor(text("ab", { color: "red" }), text("xcd"));
    Transforms.select(editor, point([1], 1));
    Editor.deleteBackward(editor);
    editor.onChange();
    expect(state(editor)).toEqual({
      anchor: point([0], 2),
      marks: { type: "formatted" },
      side: "right",
    });
    Editor.insertText(editor, "y");
    expect(editor.children).toEqual([paragraph(text("ab", { color: "red" }), text("ycd"))]);
  });
});

describe("输入归属", () => {
  it("右侧槽位输入的文字归入右侧格式", () => {
    const editor = createTestEditor(text("ab"), text("cd", { bold: true }));
    Transforms.select(editor, point([0], 2));
    moveCaret(editor, false);
    Editor.insertText(editor, "x");
    expect(editor.children).toEqual([paragraph(text("ab"), text("xcd", { bold: true }))]);
  });

  it("左侧槽位输入的文字沿用左侧格式", () => {
    const editor = createTestEditor(text("ab"), text("cd", { bold: true }));
    Transforms.select(editor, point([0], 2));
    Editor.insertText(editor, "x");
    expect(editor.children).toEqual([paragraph(text("abx"), text("cd", { bold: true }))]);
  });

  it("跳出段末行内代码后输入无格式文字", () => {
    const editor = createTestEditor(text("ab", { code: true }));
    Transforms.select(editor, point([0], 2));
    Editor.insertText(editor, "x");
    expect(editor.children).toEqual([paragraph(text("ab", { code: true }), text("x"))]);
  });

  it("折叠光标的标记取自所在文本，不继承前一个文本", () => {
    const editor = createTestEditor(
      text("ab"),
      { type: "link", url: "u", children: [text("cd", { bold: true })] },
      text("")
    );
    Transforms.select(editor, point([2], 0));
    expect(Editor.marks(editor)).toEqual({ type: "formatted" });
  });
});
