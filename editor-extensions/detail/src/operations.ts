import type { Editor } from "slate";
import { ReactEditor } from "slate-react";
import { setOrInsertNode } from "@tau/editor/api";

export const insertDetails = (editor: Editor) => {
  if (!editor.selection || ReactEditor.isReadOnly(editor)) return;
  setOrInsertNode(
    editor,
    {
      type: "detail",
      title: "",
      open: true,
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
