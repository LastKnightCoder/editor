import type { Editor } from "slate";
import type * as Y from "yjs";
import { YjsEditor, withYHistory, withYjs, type YHistoryEditor } from "@slate-yjs/core";

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

/** 先把未发出的本地改动写进 Y.Doc，再让 UndoManager 另起一个撤销步 */
export function splitYjsUndoStep(editor: Editor) {
  const bound = editor as Editor & YHistoryEditor;
  if (!YjsEditor.connected(bound)) return;
  YjsEditor.flushLocalChanges(bound);
  bound.undoManager.stopCapturing();
}
