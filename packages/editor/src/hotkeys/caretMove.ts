import { ReactEditor } from "slate-react";
import type { EditorCommand, EditorHotkey } from "../api/command";
import { moveCaret } from "../utils/caretAffinity";

// 边界处先切换光标偏向、再按字符移动；不涉及边界时放行给浏览器原生移动
const caretMove =
  (reverse: boolean): EditorCommand["run"] =>
  (editor, ctx) => {
    if (moveCaret(editor, reverse)) ctx.event?.preventDefault();
  };

const editable: EditorCommand["when"] = editor => !ReactEditor.isReadOnly(editor);

export const caretMoveCommands: EditorCommand[] = [
  { id: "tau.edit.move-left", title: "光标左移（边界两步）", when: editable, run: caretMove(true) },
  {
    id: "tau.edit.move-right",
    title: "光标右移（边界两步）",
    when: editable,
    run: caretMove(false),
  },
];

export const caretMoveHotkeys: EditorHotkey[] = [
  { key: "left", command: "tau.edit.move-left" },
  { key: "right", command: "tau.edit.move-right" },
];
