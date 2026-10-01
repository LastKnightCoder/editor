import type { Editor } from "slate";
import { ReactEditor } from "slate-react";
import { setOrInsertNode } from "@tau/editor/api";
import type { Color } from "./variants";

export const insertHighlightBlock = (editor: Editor, color = "red" as Color) => {
  if (!editor.selection || ReactEditor.isReadOnly(editor)) return;
  return setOrInsertNode(
    editor,
    {
      type: "highlight-block",
      color,
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "formatted",
              text: "",
            },
          ],
        },
      ],
    },
    {
      select: true,
    }
  );
};
