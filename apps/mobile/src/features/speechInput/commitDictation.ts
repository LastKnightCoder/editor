import { Editor, Node, Range, Transforms, type Point, type PointRef, type RangeRef } from "slate";
import { HistoryEditor, type History } from "slate-history";

export type DictationTarget =
  /** 编辑态：锁定的插入点 */
  | { kind: "point"; pointRef: PointRef }
  /** 阅读态：文末追加新段落 */
  | { kind: "end" };

/** 调用方负责在会话结束后 unref 目标 pointRef 与返回的 rangeRef */
export interface DictationCommit {
  /** 已写入文本在文档中的范围（用于润色替换和高亮） */
  rangeRef: RangeRef;
  /** 把这段替换成新文本（润色 / 用原文 切换用），与首次写入合并为同一撤销批次 */
  replace(text: string): void;
  /** 撤销这次写入（含后续 replace），文档回到写入前 */
  undo(): void;
}

type Batch = History["undos"][number];

/** 按换行拆段写入：首段接在 at 处，其余段落依次拆块插在其后，返回写入范围 */
function writeSegments(editor: Editor, at: Point, text: string): Range {
  const start = Editor.pointRef(editor, at, { affinity: "backward" });
  const cursor = Editor.pointRef(editor, at, { affinity: "forward" });
  text.split(/\r?\n/).forEach((segment, index) => {
    if (index > 0) Transforms.splitNodes(editor, { at: cursor.current!, always: true });
    if (segment) Transforms.insertText(editor, segment, { at: cursor.current! });
  });
  return { anchor: start.unref()!, focus: cursor.unref()! };
}

function isSoleEmptyParagraph(editor: Editor): boolean {
  return editor.children.length === 1 && Node.string(editor.children[0]) === "";
}

/** 文末插入点：文档只有一个空段落时直接填入，否则追加一个空段落 */
function prepareEndPoint(editor: Editor): Point {
  if (!isSoleEmptyParagraph(editor)) {
    const at = [editor.children.length];
    Transforms.insertNodes(
      editor,
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      } as Node,
      { at, select: false }
    );
    return Editor.start(editor, at);
  }
  return Editor.start(editor, [0]);
}

function lastBatch(editor: Editor): Batch | undefined {
  return HistoryEditor.isHistoryEditor(editor) ? editor.history.undos.at(-1) : undefined;
}

/** 把定稿文本一次性写入文档，整次写入（含后续 replace）为一个撤销步 */
export function commitDictation(
  editor: Editor,
  target: DictationTarget,
  text: string
): DictationCommit | null {
  if (!text.trim()) return null;
  const at = target.kind === "point" ? target.pointRef.current : null;
  if (target.kind === "point" && !at) return null;

  const write = (content: string, from: Point) => {
    const range = writeSegments(editor, from, content);
    if (target.kind === "point") Transforms.select(editor, range.focus);
    return range;
  };

  let range!: Range;
  const firstWrite = () => {
    range = write(text, at ?? prepareEndPoint(editor));
  };
  if (HistoryEditor.isHistoryEditor(editor)) HistoryEditor.withNewBatch(editor, firstWrite);
  else firstWrite();
  let batch = lastBatch(editor);
  const rangeRef = Editor.rangeRef(editor, range, { affinity: "inward" });

  return {
    rangeRef,
    replace(next) {
      const current = rangeRef.current;
      if (!current) return;
      const run = () => {
        Transforms.delete(editor, { at: current });
        rangeRef.current = write(next, Range.start(current));
      };
      if (!HistoryEditor.isHistoryEditor(editor)) return run();
      // 写入后用户若有其他编辑，不能并进别人的批次，退化为新撤销步
      if (batch && lastBatch(editor) === batch) HistoryEditor.withMerging(editor, run);
      else HistoryEditor.withNewBatch(editor, run);
      batch = lastBatch(editor);
    },
    undo() {
      if (batch && lastBatch(editor) === batch) editor.undo();
    },
  };
}
