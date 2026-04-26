import type { HeaderElement } from "../../../types";
import { Editor, NodeEntry, Range, Transforms } from "slate";

export const insertBreak = (editor: Editor) => {
  const { insertBreak } = editor;
  editor.insertBreak = () => {
    const [match] = Editor.nodes(editor, {
      match: (n) => n.type === "header",
    });
    if (match) {
      const [node, path] = match as NodeEntry<HeaderElement>;
      const { selection } = editor;
      if (
        selection &&
        Range.isCollapsed(selection) &&
        Editor.isStart(editor, selection.anchor, path)
      ) {
        Editor.withoutNormalizing(editor, () => {
          const nextPath = [...path.slice(0, -1), path[path.length - 1] + 1];
          Transforms.insertNodes(
            editor,
            {
              type: "paragraph",
              children: [{ type: "formatted", text: "" }],
            },
            { at: path },
          );
          Transforms.select(editor, Editor.start(editor, nextPath));
        });
        return;
      }
      if (node.collapsed) {
        Transforms.setNodes(editor, { collapsed: false }, { at: path });
        return;
      }
      // 标题换行时，插入段落，而不是标题
      insertBreak();
      Transforms.setNodes(editor, { type: "paragraph" });
      Transforms.unsetNodes(editor, "level");
      return;
    }
    insertBreak();
  };

  return editor;
};
