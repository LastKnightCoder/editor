import React from "react";
import { Editor, Transforms } from "slate";
import { IHotKeyConfig } from "../types";
import { ReactEditor } from "slate-react";

export const selectAll: IHotKeyConfig[] = [
  {
    hotKey: "mod+a",
    action: (editor: Editor, event: React.KeyboardEvent<HTMLDivElement>) => {
      if (editor.children.length === 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      ReactEditor.focus(editor as ReactEditor);
      Transforms.select(editor, {
        anchor: Editor.start(editor, []),
        focus: Editor.end(editor, []),
      });
    },
  },
];
