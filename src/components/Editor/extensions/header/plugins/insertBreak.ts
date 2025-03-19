import { HeaderElement } from "@/components/Editor/types";
import { Editor, NodeEntry, Transforms } from "slate";

export const insertBreak = (editor: Editor) => {
  const { insertBreak } = editor;
  editor.insertBreak = () => {
    const [match] = Editor.nodes(editor, {
      match: (n) => n.type === "header",
    });
    if (match) {
      const [node, path] = match as NodeEntry<HeaderElement>;
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
