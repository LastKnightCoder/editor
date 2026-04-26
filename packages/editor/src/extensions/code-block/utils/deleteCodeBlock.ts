import { Editor, Path, Transforms } from "slate";

import { focusParagraphAfterDelete } from "./focusParagraphAfterDelete";

export const deleteCodeBlock = (editor: Editor, path: Path) => {
  Editor.withoutNormalizing(editor, () => {
    Transforms.delete(editor, { at: path });
    Transforms.insertNodes(
      editor,
      {
        type: "paragraph",
        children: [
          {
            type: "formatted",
            text: "",
          },
        ],
      },
      {
        at: path,
        select: true,
      },
    );
  });

  focusParagraphAfterDelete(editor, path);
};
