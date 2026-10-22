import type { Editor } from "slate";
import { HistoryEditor } from "slate-history";

/** 接管撤销的文档源（history: "external"）提供的撤销步切分 */
const splitters = new WeakMap<Editor, () => void>();

export function registerUndoStepSplitter(editor: Editor, split: () => void): void {
  splitters.set(editor, split);
}

/** `fn` 内的修改单独成一个撤销步，不与之前的输入合并 */
export function withNewUndoStep(editor: Editor, fn: () => void): void {
  const split = splitters.get(editor);
  if (split) {
    split();
    fn();
    return;
  }
  if (HistoryEditor.isHistoryEditor(editor)) {
    HistoryEditor.withNewBatch(editor, fn);
    return;
  }
  fn();
}
