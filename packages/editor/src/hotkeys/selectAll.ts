import { Editor, Transforms } from "slate";
import type { EditorCommand, EditorHotkey } from "../api/command";
import { ReactEditor } from "slate-react";

export const selectAllCommands: EditorCommand[] = [
  {
    id: "tau.edit.select-all",
    title: "全选",
    run: (editor: Editor, ctx) => {
      if (editor.children.length === 0) {
        return;
      }

      ctx.event?.preventDefault();
      ctx.event?.stopPropagation();
      ReactEditor.focus(editor as ReactEditor);
      Transforms.select(editor, {
        anchor: Editor.start(editor, []),
        focus: Editor.end(editor, []),
      });
    },
  },
];

export const selectAllHotkeys: EditorHotkey[] = [{ key: "mod+a", command: "tau.edit.select-all" }];
