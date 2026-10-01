import { Editor, Element as SlateElement, Transforms } from "slate";

import type { EditorCommand, EditorHotkey } from "@tau/editor/api";
import type { HeaderElement } from "./types";

/** 选区所在的标题或段落（段落时视为从 h6 开始升级） */
const targetOf = (editor: Editor, types: string[]) => {
  const [match] = Editor.nodes(editor, {
    match: n => SlateElement.isElement(n) && types.includes(n.type),
  });
  return match as [SlateElement, number[]] | undefined;
};

/** alt+=：标题升一级（数字减小）；在段落上升为 h6 */
const promote: EditorCommand = {
  id: "tau.header.promote",
  title: "提高标题级别",
  run: (editor, ctx) => {
    const match = targetOf(editor, ["paragraph", "header"]);
    if (!match) return;
    const [element, path] = match;
    if (element.type === "header") {
      const currentLevel = (element as HeaderElement).level;
      if (currentLevel === 1) return;
      Transforms.setNodes(
        editor,
        { level: (currentLevel - 1) as HeaderElement["level"] },
        { at: path }
      );
    } else {
      Transforms.setNodes(editor, { type: "header", level: 6 }, { at: path });
    }
    ctx.event?.preventDefault();
  },
};

/** alt+-：标题降一级（数字增大）；h6 再降变回段落 */
const demote: EditorCommand = {
  id: "tau.header.demote",
  title: "降低标题级别",
  run: (editor, ctx) => {
    const match = targetOf(editor, ["header"]);
    if (!match) return;
    const [element, path] = match;
    const currentLevel = (element as HeaderElement).level;
    if (currentLevel === 6) {
      Transforms.setNodes(editor, { type: "paragraph" }, { at: path });
      Transforms.unsetNodes(editor, "level", { at: path });
    } else {
      Transforms.setNodes(
        editor,
        { level: (currentLevel + 1) as HeaderElement["level"] },
        { at: path }
      );
    }
    ctx.event?.preventDefault();
  },
};

export const headerCommands: EditorCommand[] = [promote, demote];

export const headerHotkeys: EditorHotkey[] = [
  { key: "alt+=", command: "tau.header.promote" },
  { key: "alt+-", command: "tau.header.demote" },
];
