import { Editor, NodeEntry, Transforms } from "slate";
import { MultiColumnItemElement } from "@/components/Editor/types";
import { isParagraphAndEmpty } from "@/components/Editor/utils";

export const deleteBackward = (editor: Editor) => {
  const { deleteBackward } = editor;

  editor.deleteBackward = (unit) => {
    const [match] = Editor.nodes(editor, {
      match: (n) => n.type === "multi-column-item",
      mode: "lowest",
    });
    if (!match) {
      deleteBackward(unit);
      return;
    }

    // 当只有一个空段落的时候，将当前的列删除
    const [ele, path] = match as NodeEntry<MultiColumnItemElement>;
    if (ele.children.length > 1) {
      deleteBackward(unit);
      return;
    }

    const child = ele.children[0];
    if (child.type !== "paragraph") {
      deleteBackward(unit);
      return;
    }

    if (isParagraphAndEmpty(editor)) {
      Transforms.delete(editor, {
        at: path,
      });
      return;
    }

    deleteBackward(unit);
  };

  return editor;
};
