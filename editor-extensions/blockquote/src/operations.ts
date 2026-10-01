import type { Editor } from "slate";
import { ReactEditor } from "slate-react";
import { setOrInsertNode } from "@tau/editor/api";

export const insertBlockquote = (editor: Editor) => {
  if (!editor.selection || ReactEditor.isReadOnly(editor)) return;
  setOrInsertNode(
    editor,
    {
      type: "blockquote",
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
