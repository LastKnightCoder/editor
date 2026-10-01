import type { Editor } from "slate";
import type * as Y from "yjs";
import { withYHistory, withYjs } from "@slate-yjs/core";

/** 本地文件与协作正文共用 Slate/Yjs 绑定及撤销适配。 */
export function withYjsDocument<T extends Editor>(
  editor: T,
  root: Y.XmlText,
  origin: object,
  undoManager?: Y.UndoManager
) {
  const bound = withYHistory(withYjs(editor, root, { localOrigin: origin }));
  if (undoManager) {
    bound.undoManager.destroy();
    bound.undoManager = undoManager;
  }
  return bound;
}
