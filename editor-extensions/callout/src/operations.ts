import type { Editor } from "slate";
import { ReactEditor } from "slate-react";
import { setOrInsertNode } from "@tau/editor/api";

export const insertCallout = (
  editor: Editor,
  type: "tip" | "warning" | "info" | "danger" | "note"
) => {
  if (!editor.selection || ReactEditor.isReadOnly(editor)) return;
  setOrInsertNode(
    editor,
    {
      type: "callout",
      calloutType: type,
      title: "",
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
