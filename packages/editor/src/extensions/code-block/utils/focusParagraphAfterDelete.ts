import { Editor, Path, Transforms } from "slate";
import { ReactEditor } from "slate-react";

export const focusParagraphAfterDelete = (editor: Editor, path: Path) => {
  setTimeout(() => {
    try {
      ReactEditor.focus(editor);
      const start = Editor.start(editor, path);
      Transforms.select(editor, {
        anchor: start,
        focus: start,
      });
    } catch {
      // 节点已不存在时忽略聚焦恢复
    }
  }, 0);
};
