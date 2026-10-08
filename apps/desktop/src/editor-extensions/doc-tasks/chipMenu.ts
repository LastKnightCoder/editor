/**
 * 点胶囊弹出的小菜单状态与动作。动作都是改胶囊所在的那段文字：
 * 改日期 = 换成新的绝对日期，换项目 = 换成 `#新项目`，移除 = 删掉这段（连同一侧空格）。
 * 普通 Slate 文本操作，撤销照常可用。
 */

import { create } from "zustand";
import { Editor, Range, Text, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { formatDocTaskDate } from "@/entity/doc-tasks";

interface State {
  editor: Editor | null;
  anchor: HTMLElement | null;
  kind: "group" | "date" | null;
}

export const useChipMenuStore = create<State>(() => ({ editor: null, anchor: null, kind: null }));

export const closeChipMenu = () =>
  useChipMenuStore.setState({ editor: null, anchor: null, kind: null });

/** 胶囊 DOM 对应的文档 Range（胶囊即装饰后的一个叶子片段） */
function chipRange(editor: Editor, anchor: HTMLElement): Range | null {
  if (!anchor.isConnected) return null;
  const domRange = globalThis.document.createRange();
  // 只取原文文字（胶囊后附的相对说法是不可编辑的展示，不在文档里）
  const text = anchor.querySelector("[data-slate-string], [data-slate-zero-width]") ?? anchor;
  domRange.selectNodeContents(text);
  return ReactEditor.toSlateRange(editor, domRange, { exactMatch: false, suppressThrow: true });
}

function replaceChip(text: string) {
  const { editor, anchor } = useChipMenuStore.getState();
  closeChipMenu();
  if (!editor || !anchor) return;
  const range = chipRange(editor, anchor);
  if (!range || Range.isCollapsed(range)) return;
  Transforms.insertText(editor, text, { at: range });
}

export const setChipDate = (day: number) => replaceChip(formatDocTaskDate(day));

export const setChipGroup = (title: string) => replaceChip(`#${title}`);

/** 移除胶囊：连同其后（或其前）的一个空格一起删，避免留下双空格 */
export function removeChip() {
  const { editor, anchor } = useChipMenuStore.getState();
  closeChipMenu();
  if (!editor || !anchor) return;
  const range = chipRange(editor, anchor);
  if (!range || Range.isCollapsed(range)) return;
  const [start, end] = Range.edges(range);
  const [leaf] = Editor.leaf(editor, end);
  const after = Text.isText(leaf) ? leaf.text[end.offset] : undefined;
  const at =
    after === " "
      ? { anchor: start, focus: { ...end, offset: end.offset + 1 } }
      : start.offset > 0 && Editor.leaf(editor, start)[0].text[start.offset - 1] === " "
        ? { anchor: { ...start, offset: start.offset - 1 }, focus: end }
        : range;
  Transforms.delete(editor, { at });
}
