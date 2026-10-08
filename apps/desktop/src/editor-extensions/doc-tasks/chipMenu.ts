/**
 * 点胶囊弹出的小菜单状态与动作。动作都是改胶囊所在的那段文字：
 * 改日期 = 换成新的绝对日期，换项目 = 换成 `#新项目`，移除 = 删掉这段（连同一侧空格）。
 * 普通 Slate 文本操作，撤销照常可用。
 */

import { create } from "zustand";
import { Editor, Range, Text, Transforms, type RangeRef } from "slate";
import { captureEditorSubmission, type Submission } from "@tau/editor/api";
import { formatDocTaskDate } from "@/entity/doc-tasks";
import { docTaskGroupsOf } from "./service";
import { Element } from "slate";

interface State {
  editor: Editor | null;
  anchor: HTMLElement | null;
  kind: "group" | "date" | null;
  range: RangeRef | null;
  original: string;
  submission: Submission<void> | null;
  taskId?: string;
}

export const useChipMenuStore = create<State>(() => ({
  editor: null,
  anchor: null,
  kind: null,
  range: null,
  original: "",
  submission: null,
}));

export function closeChipMenu() {
  const { range, submission } = useChipMenuStore.getState();
  range?.unref();
  submission?.dispose();
  useChipMenuStore.setState({
    editor: null,
    anchor: null,
    kind: null,
    range: null,
    original: "",
    submission: null,
    taskId: undefined,
  });
}

export function openChipMenu(
  editor: Editor,
  anchor: HTMLElement,
  kind: "group" | "date",
  range: Range,
  expected?: { taskId: string; text?: string }
) {
  closeChipMenu();
  const item = Editor.above(editor, {
    at: range,
    match: node => Element.isElement(node) && node.type === "check-list-item",
  });
  if (
    expected &&
    (item?.[0].taskId !== expected.taskId || Editor.string(editor, range) !== expected.text)
  )
    return;
  useChipMenuStore.setState({
    editor,
    anchor,
    kind,
    range: Editor.rangeRef(editor, range, { affinity: "inward" }),
    original: Editor.string(editor, range),
    submission: captureEditorSubmission(editor),
    taskId: expected?.taskId,
  });
}

function replaceChip(text: string) {
  writeChip((editor, range) => Transforms.insertText(editor, text, { at: range }));
}

function writeChip(write: (editor: Editor, range: Range) => void) {
  const { editor, anchor, range, original, submission, taskId } = useChipMenuStore.getState();
  try {
    if (!editor || !anchor?.isConnected || !range?.current || !submission) return;
    submission.commit(() => {
      const at = range.current;
      const item =
        at &&
        Editor.above(editor, {
          at,
          match: node => Element.isElement(node) && node.type === "check-list-item",
        });
      if (
        at &&
        !Range.isCollapsed(at) &&
        Editor.string(editor, at) === original &&
        (!taskId || item?.[0].taskId === taskId)
      )
        write(editor, at);
      return undefined;
    });
  } finally {
    closeChipMenu();
  }
}

export const setChipDate = (day: number) => replaceChip(formatDocTaskDate(day));

export const setChipGroup = (title: string, groupId?: number) =>
  writeChip((editor, range) => {
    const item = Editor.above(editor, {
      at: range,
      match: node => Element.isElement(node) && node.type === "check-list-item",
    });
    const group = docTaskGroupsOf(editor)
      ?.list()
      .find(candidate => candidate.id === groupId);
    Editor.withoutNormalizing(editor, () => {
      Transforms.insertText(editor, `#${title}`, { at: range });
      if (item && group)
        Transforms.setNodes(
          editor,
          { taskGroup: { id: group.id, token: `#${title}`, createdAt: group.createdAt } },
          { at: item[1] }
        );
    });
  });

/** 移除胶囊：连同其后（或其前）的一个空格一起删，避免留下双空格 */
export function removeChip() {
  writeChip((editor, range) => {
    const [start, end] = Range.edges(range);
    const [leaf] = Editor.leaf(editor, end);
    const after = Text.isText(leaf) ? leaf.text[end.offset] : undefined;
    const at =
      after === " "
        ? { anchor: start, focus: { ...end, offset: end.offset + 1 } }
        : start.offset > 0 && Editor.leaf(editor, start)[0].text[start.offset - 1] === " "
          ? { anchor: { ...start, offset: start.offset - 1 }, focus: end }
          : range;
    const item = Editor.above(editor, {
      at: start,
      match: node => Element.isElement(node) && node.type === "check-list-item",
    });
    Transforms.delete(editor, { at });
    if (item && useChipMenuStore.getState().kind === "group")
      Transforms.setNodes(editor, { taskGroup: null }, { at: item[1] });
  });
}
