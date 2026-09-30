import { Editor, Element as SlateElement, Range } from "slate";

import type { EditorCommand, EditorHotkey } from "../../api";
import { insertBlockMath, wrapInlineMath } from "../../utils";

/** mod+shift+e：选区包成行内公式 */
const wrapInline: EditorCommand = {
  id: "tau.math.wrap-inline",
  title: "行内公式",
  run: (editor, ctx) => {
    wrapInlineMath(editor);
    ctx.event?.preventDefault();
  },
};

/** mod+shift+m：光标在段落内时插入块级公式 */
const insertBlock: EditorCommand = {
  id: "tau.math.insert-block",
  title: "块级公式",
  run: (editor, ctx) => {
    const { selection } = editor;
    if (!selection || !Range.isCollapsed(selection)) return;
    const [match] = Editor.nodes(editor, {
      match: n => SlateElement.isElement(n) && n.type === "paragraph",
    });
    if (!match) return;
    insertBlockMath(editor);
    ctx.event?.preventDefault();
  },
};

export const inlineMathCommands: EditorCommand[] = [wrapInline];
export const inlineMathHotkeys: EditorHotkey[] = [
  { key: "mod+shift+e", command: "tau.math.wrap-inline" },
];

export const blockMathCommands: EditorCommand[] = [insertBlock];
export const blockMathHotkeys: EditorHotkey[] = [
  { key: "mod+shift+m", command: "tau.math.insert-block" },
];
