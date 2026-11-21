import { Editor, Node, Transforms, Range } from "slate";
import { setOrInsertNode, focusInsertedPreviewElement, wrapInlineText } from "@tau/editor/api";

import type { InlineMathElement } from "./types";

export const insertBlockMath = (editor: Editor) => {
  const path = setOrInsertNode(editor, {
    type: "block-math",
    tex: "",
    children: [{ type: "formatted", text: "" }],
  });
  focusInsertedPreviewElement(editor, path);
  return path;
};

export const unWrapInlineMath = (editor: Editor) => {
  if (!editor.selection) return;
  const formulas = Array.from(
    Editor.nodes<InlineMathElement>(editor, {
      match: node => node.type === "inline-math",
    })
  );
  Editor.withoutNormalizing(editor, () => {
    for (const [formula, path] of formulas.reverse()) {
      if (Node.string(formula) === formula.tex) {
        Transforms.unwrapNodes(editor, { at: path, voids: true });
      } else {
        // 源码已改写或公式原本没有富文本，解除时以当前源码为准。
        Transforms.removeNodes(editor, { at: path });
        Transforms.insertNodes(editor, { type: "formatted", text: formula.tex }, { at: path });
      }
    }
  });
};

export const wrapInlineMath = (editor: Editor) => {
  const { selection } = editor;
  if (!selection) return;
  if (Range.isCollapsed(selection)) {
    Transforms.insertNodes(editor, {
      type: "inline-math",
      tex: "",
      children: [{ type: "formatted", text: "" }],
    });
  } else {
    wrapInlineText(editor, range => ({
      type: "inline-math",
      tex: Editor.string(editor, range),
      children: [],
    }));
  }
  const [math] = Editor.nodes(editor, {
    match: node => node.type === "inline-math",
  });
  if (math) focusInsertedPreviewElement(editor, math[1]);
};
