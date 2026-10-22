import { createEditor, Descendant, Editor, Node, Transforms } from "slate";
import { withHistory } from "slate-history";
import { describe, expect, it, vi } from "vitest";

import { withInputRules } from "../../../../core/kit/inputRules.ts";
import { createCircuitBreaker } from "../../../../core/kit/extensionGuard.ts";
import { registerUndoStepSplitter } from "../../../../core/utils/undoStep.ts";
import { textFormattingInputRules } from "../inputRules.ts";

const OWNER = "tau.text-formatting";
const rules = textFormattingInputRules.map(rule => ({ owner: OWNER, rule }));

function setup(children: Descendant[] = [paragraph("")], { history = true } = {}) {
  const report = vi.fn();
  const breaker = createCircuitBreaker(() => ({ report }));
  const base = history ? withHistory(createEditor()) : createEditor();
  const editor = withInputRules(base, rules, breaker);
  editor.children = children;
  Transforms.select(editor, Editor.end(editor, []));
  return { editor, report, breaker };
}

function paragraph(text: string, marks: Record<string, unknown> = {}): Descendant {
  return { type: "paragraph", children: [{ type: "formatted", text, ...marks }] } as Descendant;
}

const type = (editor: Editor, text: string) => {
  for (const char of text) editor.insertText(char);
};

/** 段落的叶子：文字与标记（去掉 type） */
const leaves = (editor: Editor) =>
  Array.from(Node.texts(editor)).map(([node]) =>
    Object.fromEntries(Object.entries(node).filter(([key]) => key !== "type"))
  );

describe("行内输入规则", () => {
  it.each([
    ["**粗体**", { bold: true }],
    ["__粗体__", { bold: true }],
    ["*斜体*", { italic: true }],
    ["_斜体_", { italic: true }],
    ["***粗斜***", { bold: true, italic: true }],
    ["~~删除~~", { strikethrough: true }],
    ["==高亮==", { highlight: "yellow" }],
    ["`code`", { code: true }],
  ])("%s 转成对应标记", (input, marks) => {
    const { editor } = setup();
    type(editor, input);
    const content = input.replace(/^[*_~=`]+|[*_~=`]+$/g, "");
    expect(leaves(editor)).toEqual([{ text: content, ...marks }]);
  });

  it("前后文字保留，后续输入不带新标记", () => {
    const { editor } = setup();
    type(editor, "前 **粗** 后");
    expect(leaves(editor)).toEqual([{ text: "前 " }, { text: "粗", bold: true }, { text: " 后" }]);
  });

  it("**x* 不会先被吃成斜体", () => {
    const { editor } = setup();
    type(editor, "**hello*");
    expect(leaves(editor)).toEqual([{ text: "**hello*" }]);
    type(editor, "*");
    expect(leaves(editor)).toEqual([{ text: "hello", bold: true }]);
  });

  it.each([
    ["** x **", "内容首尾是空白"],
    ["****", "内容为空"],
    ["\\*x*", "开头被转义"],
    ["*x\\*", "收尾被转义"],
    ["snake_case_name_", "下划线在词内"],
    ["中文_斜体_", "下划线前紧邻文字"],
    ["~删~", "单个波浪线"],
    ["a == b ==", "等号内侧是空白"],
  ])("%s 不触发（%s）", input => {
    const { editor } = setup();
    type(editor, input);
    expect(leaves(editor)).toEqual([{ text: input }]);
  });

  it("星号写法允许词内", () => {
    const { editor } = setup();
    type(editor, "a*b*");
    expect(leaves(editor)).toEqual([{ text: "a" }, { text: "b", italic: true }]);
  });

  it("行内代码里不识别", () => {
    const { editor } = setup([paragraph("", { code: true })]);
    type(editor, "**x**");
    expect(leaves(editor)).toEqual([{ text: "**x**", code: true }]);
  });

  it("已经是同样标记时不触发", () => {
    const { editor } = setup([paragraph("", { bold: true })]);
    type(editor, "**x**");
    expect(leaves(editor)).toEqual([{ text: "**x**", bold: true }]);
  });

  it("已有标记的文字叠加新标记，后续输入沿用原格式", () => {
    const { editor } = setup([paragraph("", { italic: true })]);
    type(editor, "**x**y");
    expect(leaves(editor)).toEqual([
      { text: "x", italic: true, bold: true },
      { text: "y", italic: true },
    ]);
  });

  it("输入法整段上屏也能触发", () => {
    const { editor } = setup();
    type(editor, "**粗");
    editor.insertText("体**");
    expect(leaves(editor)).toEqual([{ text: "粗体", bold: true }]);
  });

  it("指定位置的插入不触发", () => {
    const { editor } = setup([paragraph("**x*")]);
    editor.insertText("*", { at: { path: [0, 0], offset: 4 } });
    expect(leaves(editor)).toEqual([{ text: "**x**" }]);
  });

  it("撤销一次回到原始符号，再撤销才删除输入", () => {
    const { editor } = setup();
    type(editor, "**粗**");
    editor.undo();
    expect(leaves(editor)).toEqual([{ text: "**粗**" }]);
    editor.undo();
    expect(leaves(editor)).toEqual([{ text: "" }]);
  });

  it("外部撤销的文档源在转换前切分撤销步", () => {
    const { editor } = setup(undefined, { history: false });
    const split = vi.fn(() => {
      expect(Node.string(editor)).toBe("**粗**");
    });
    registerUndoStepSplitter(editor, split);
    type(editor, "**粗**");
    expect(split).toHaveBeenCalledTimes(1);
  });

  it("规则出错计入所属扩展的熔断，已插入的文字保留", () => {
    const { editor, report } = setup();
    const setNodes = vi.spyOn(Transforms, "setNodes").mockImplementation(() => {
      throw new Error("boom");
    });
    try {
      type(editor, "*x*");
    } finally {
      setNodes.mockRestore();
    }
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ extension: OWNER }));
    expect(Node.string(editor)).toContain("x");
  });
});
