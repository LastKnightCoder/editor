import { Editor, Range, Transforms, Element } from "slate";
import type { EditorCommand, EditorHotkey } from "../api/command";

// 目前只管出，不管进，即在出去 inline 元素的时候，是 offset，但是进去的时候，还是 char
const inlineMove =
  (left: boolean): EditorCommand["run"] =>
  (editor, ctx) => {
    const { selection } = editor;
    const [match] = Editor.nodes(editor, {
      match: n => Element.isElement(n) && Editor.isInline(editor, n),
    });
    if (!(selection && Range.isCollapsed(selection) && match)) return;
    ctx.event?.preventDefault();
    Transforms.move(editor, { unit: "offset", reverse: left });
  };

export const inlineCommands: EditorCommand[] = [
  { id: "tau.edit.move-left", title: "行内向左移动（inline 边界）", run: inlineMove(true) },
  { id: "tau.edit.move-right", title: "行内向右移动（inline 边界）", run: inlineMove(false) },
];

export const inlineHotkeys: EditorHotkey[] = [
  { key: "left", command: "tau.edit.move-left" },
  { key: "right", command: "tau.edit.move-right" },
];
