import { createEditor, Descendant, Editor, Element, Node, Transforms } from "slate";
import { withHistory } from "slate-history";
import { describe, expect, it, vi } from "vitest";

import { ExtensionAssembly } from "../../../../core/kit/ExtensionAssembly.ts";
import {
  applyGuardedPlugins,
  createCircuitBreaker,
  withElementBehaviors,
} from "../../../../core/kit/extensionGuard.ts";
import { withInputRules } from "../../../../core/kit/inputRules.ts";
import { textFormattingExtension } from "../../../text-formatting/src/index.tsx";
import { blockMathExtension, inlineMathExtension } from "../index.tsx";

function setup(marks: Record<string, unknown> = {}) {
  const assembly = new ExtensionAssembly([
    textFormattingExtension,
    inlineMathExtension,
    blockMathExtension,
  ]);
  const breaker = createCircuitBreaker(() => ({ report: vi.fn() }));
  const editor = withInputRules(
    withElementBehaviors(
      applyGuardedPlugins(withHistory(createEditor()), assembly.pluginGroups, breaker),
      assembly.behaviors,
      breaker
    ),
    assembly.inputRules,
    breaker
  );
  editor.children = [
    { type: "paragraph", children: [{ type: "formatted", text: "", ...marks }] },
  ] as Descendant[];
  Transforms.select(editor, Editor.end(editor, []));
  return editor;
}

const type = (editor: Editor, text: string) => {
  for (const char of text) editor.insertText(char);
};

/** 段落内容：文本去掉零宽占位，公式写成 {tex} */
const content = (editor: Editor) =>
  (editor.children[0] as Element).children
    .map(child =>
      Element.isElement(child) && child.type === "inline-math"
        ? { tex: (child as unknown as { tex: string }).tex }
        : Node.string(child).replace(/\uFEFF/g, "")
    )
    .filter(item => item !== "");

describe("行内公式输入规则", () => {
  it.each([
    ["$x^2$", "x^2"],
    ["$$x^2$$", "x^2"],
    ["$\\frac{a}{b}$", "\\frac{a}{b}"],
  ])("%s 转成行内公式", (input, tex) => {
    const editor = setup();
    type(editor, input);
    expect(content(editor)).toEqual([{ tex }]);
  });

  it("前后文字保留，光标落在公式之后继续输入", () => {
    const editor = setup();
    type(editor, "设 $a$ 为");
    expect(content(editor)).toEqual(["设 ", { tex: "a" }, " 为"]);
  });

  it("$$x$ 不会先被单个 $ 吃掉", () => {
    const editor = setup();
    type(editor, "$$x$");
    expect(content(editor)).toEqual(["$$x$"]);
    type(editor, "$");
    expect(content(editor)).toEqual([{ tex: "x" }]);
  });

  it.each([
    ["$ x $", "内容首尾是空白"],
    ["$$", "内容为空"],
    ["\\$x$", "开头被转义"],
  ])("%s 不触发（%s）", input => {
    const editor = setup();
    type(editor, input);
    expect(content(editor)).toEqual([input]);
  });

  it("行内代码里不识别", () => {
    const editor = setup({ code: true });
    type(editor, "$x$");
    expect(content(editor)).toEqual(["$x$"]);
  });

  it("后续输入沿用转换前的格式", () => {
    const editor = setup({ bold: true });
    type(editor, "$x$后");
    const texts = Array.from(Node.texts(editor))
      .map(([node]) => node)
      .filter(node => node.text.replace(/\uFEFF/g, "") !== "");
    expect(texts).toEqual([expect.objectContaining({ text: "后", bold: true })]);
  });

  it("撤销一次回到原始符号", () => {
    const editor = setup();
    type(editor, "$x$");
    editor.undo();
    expect(content(editor)).toEqual(["$x$"]);
  });
});

describe("块级公式快捷语法", () => {
  it("段落里只有 $$ 时回车变成块级公式", () => {
    const editor = setup();
    type(editor, "$$");
    editor.insertBreak();
    expect(editor.children[0]).toMatchObject({ type: "block-math", tex: "" });
    expect(editor.children).toHaveLength(1);
  });

  it.each(["$$x", "a$$", "$$$"])("%s 回车照常换行", input => {
    const editor = setup();
    type(editor, input);
    editor.insertBreak();
    expect(editor.children.map(node => (node as Element).type)).toEqual(["paragraph", "paragraph"]);
  });

  it("撤销回车回到 $$", async () => {
    const editor = setup();
    type(editor, "$$");
    // 回车是单独一次按键：等 Slate 清空本轮操作，撤销历史才会分步
    await Promise.resolve();
    editor.insertBreak();
    editor.undo();
    expect(content(editor)).toEqual(["$$"]);
  });
});
