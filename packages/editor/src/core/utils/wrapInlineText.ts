import { Editor, Path, Range, Text, Transforms } from "slate";
import type { InlineElement } from "../types/custom-element";

/** 只包裹同一父节点下连续的选中文字，避免 Slate 把部分选中的行内祖先整体移入。 */
export function wrapInlineText(
  editor: Editor,
  create: (range: Range) => InlineElement,
  at = editor.selection
): boolean {
  if (!at || Range.isCollapsed(at)) return false;
  const [start, end] = Range.edges(at);
  const runs: Range[] = [];
  for (const [leaf, path] of Editor.nodes<Text>(editor, { at, match: Text.isText })) {
    const anchor = Path.equals(path, start.path) ? start : { path, offset: 0 };
    const focus = Path.equals(path, end.path) ? end : { path, offset: leaf.text.length };
    if (anchor.offset === focus.offset) continue;
    const last = runs.at(-1);
    if (last && Path.equals(Path.next(last.focus.path), path)) last.focus = focus;
    else runs.push({ anchor, focus });
  }
  if (!runs.length) return false;

  Editor.withoutNormalizing(editor, () => {
    const selected = at === editor.selection;
    const first = runs[0].anchor;
    const last = runs[runs.length - 1].focus;
    const ref = selected
      ? Editor.rangeRef(
          editor,
          Range.isBackward(at) ? { anchor: last, focus: first } : { anchor: first, focus: last },
          { affinity: "inward" }
        )
      : null;
    try {
      // 从后向前处理，后段的拆分和移动不会改变前段的路径。
      for (const run of runs.reverse()) {
        Transforms.wrapNodes(editor, create(run), { at: run, split: true });
      }
      if (ref?.current) Transforms.select(editor, ref.current);
    } finally {
      ref?.unref();
    }
  });
  return true;
}
