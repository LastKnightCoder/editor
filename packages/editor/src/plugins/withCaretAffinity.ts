import { Editor, Node, Point, Range } from "slate";
import type { BaseSelection, SelectionOperation } from "slate";
import { ReactEditor } from "slate-react";

import {
  CARET_AFFINITY_ENABLED,
  canonicalizeCaret,
  getCaretSlots,
  isCaretIntent,
  pickDefaultSlotIndex,
} from "../utils/caretAffinity";

const resolveSelection = (
  selection: BaseSelection,
  newProperties: SelectionOperation["newProperties"]
): Range | null => {
  if (!newProperties) return null;
  if (!selection) return Range.isRange(newProperties) ? newProperties : null;
  return { ...selection, ...newProperties } as Range;
};

const isInteractive = (editor: Editor) =>
  !ReactEditor.isComposing(editor) && !ReactEditor.isReadOnly(editor);

/**
 * 光标偏向（见 utils/caretAffinity）：
 * - 折叠光标的标记取自光标所在文本本身，不再继承前一个文本（槽位由落点 + 待插入标记表达）；
 * - 点击、上下键、撤销等落到边界时按默认规则归位到一个槽位；偏向命令自身的选区变化不归位；
 * - 编辑后停在边界的光标保持原归属，换成规范表示。
 */
export const withCaretAffinity = (
  editor: Editor,
  getNonInclusiveKeys: () => ReadonlySet<string>
): Editor => {
  if (!CARET_AFFINITY_ENABLED) return editor;
  const { apply, getMarks, onChange } = editor;

  editor.getMarks = () => {
    const { selection, marks } = editor;
    if (marks || !selection || !Range.isCollapsed(selection)) return getMarks();
    if (Editor.void(editor, { at: selection.anchor })) return getMarks();
    const { text: _text, ...rest } = Node.leaf(editor, selection.anchor.path);
    return rest;
  };

  editor.apply = op => {
    if (op.type !== "set_selection" || isCaretIntent(editor) || !isInteractive(editor)) {
      apply(op);
      return;
    }
    const next = resolveSelection(editor.selection, op.newProperties);
    const info = next && Range.isCollapsed(next) ? getCaretSlots(editor, next.anchor) : null;
    if (!next || !info || info.slots.length < 2) {
      apply(op);
      return;
    }
    const slot = info.slots[pickDefaultSlotIndex(info.slots, getNonInclusiveKeys())];
    const { selection } = editor;
    apply(
      Point.equals(slot.point, next.anchor)
        ? op
        : {
            type: "set_selection",
            properties: selection ? { anchor: selection.anchor, focus: selection.focus } : null,
            newProperties: { anchor: slot.point, focus: slot.point },
          }
    );
    // set_selection 会清空待插入标记，槽位的归属在之后写回
    if (slot.pending) editor.marks = { ...slot.pending };
  };

  // 在一批操作结束、渲染之前规范化，避免变换中途改写选区
  editor.onChange = options => {
    if (isInteractive(editor) && editor.operations.some(op => op.type !== "set_selection")) {
      canonicalizeCaret(editor);
    }
    onChange(options);
  };

  return editor;
};
