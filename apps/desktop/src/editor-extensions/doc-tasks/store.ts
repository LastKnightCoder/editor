/**
 * 勾选项里 `#` 项目候选的状态。同一时刻只有一个编辑器能打开候选，store 记着是哪一个；
 * 候选面板由扩展图层渲染，只在 editor 属于自己时显示。
 */

import { create } from "zustand";
import { Editor, Element, Range, Transforms, type PointRef } from "slate";
import { captureEditorSubmission, notifierOf, type Submission } from "@tau/editor/api";
import { docTaskGroupsOf, IDocTaskGroups } from "./service";

export type TagPickerItem =
  { kind: "group"; id: number; title: string } | { kind: "create"; title: string };

interface State {
  editor: Editor | null;
  query: string;
  activeIndex: number;
  /** 面板按 query 过滤后写回的候选（键盘选择用） */
  items: TagPickerItem[];
  start: PointRef | null;
  submission: Submission<void> | null;
}

export const useTagPickerStore = create<State>(() => ({
  editor: null,
  query: "",
  activeIndex: 0,
  items: [],
  start: null,
  submission: null,
}));

export const isTagPickerOpenFor = (editor: Editor) =>
  useTagPickerStore.getState().editor === editor;

export function openTagPicker(editor: Editor) {
  closeTagPicker();
  if (!editor.selection || !Range.isCollapsed(editor.selection)) return;
  useTagPickerStore.setState({
    editor,
    query: "",
    activeIndex: 0,
    items: [],
    start: Editor.pointRef(editor, editor.selection.anchor, { affinity: "backward" }),
    submission: captureEditorSubmission(editor, { services: [IDocTaskGroups] }),
  });
}

export function closeTagPicker() {
  const { start, submission } = useTagPickerStore.getState();
  start?.unref();
  submission?.dispose();
  useTagPickerStore.setState({
    editor: null,
    query: "",
    activeIndex: 0,
    items: [],
    start: null,
    submission: null,
  });
}

export const moveTagPickerActive = (down: boolean) =>
  useTagPickerStore.setState(state => {
    const count = state.items.length;
    if (count === 0) return state;
    return { activeIndex: (state.activeIndex + (down ? 1 : -1) + count) % count };
  });

/** 用完整项目名替换已打出的 query（保留 `#`），新建项目时先建再写 */
export async function selectTagPickerItem(item: TagPickerItem) {
  const { editor, query, start, submission } = useTagPickerStore.getState();
  const point = start?.current;
  if (!editor || !point || !submission || submission.check()) {
    closeTagPicker();
    return;
  }
  const end = Editor.after(editor, point, { distance: query.length + 1, unit: "offset" });
  const range = end ? { anchor: point, focus: end } : null;
  const expected = range ? Editor.string(editor, range) : "";
  if (!range || ![`#${query}`, `＃${query}`].includes(expected)) {
    closeTagPicker();
    return;
  }
  const reference = Editor.rangeRef(editor, range, { affinity: "inward" });
  start.unref();
  useTagPickerStore.setState({
    editor: null,
    query: "",
    activeIndex: 0,
    items: [],
    start: null,
    submission: null,
  });
  try {
    let title = item.title;
    let groupId = item.kind === "group" ? item.id : undefined;
    if (item.kind === "create") {
      const groups = docTaskGroupsOf(editor);
      if (!groups) return;
      const created = await groups.create(item.title);
      title = created.title;
      groupId = created.id;
    }
    submission.commit(() => {
      const at = reference.current;
      if (at && Editor.string(editor, at) === expected) {
        const entry = Editor.above(editor, {
          at,
          match: node => Element.isElement(node) && node.type === "check-list-item",
        });
        const group = docTaskGroupsOf(editor)
          ?.list()
          .find(candidate => candidate.id === groupId);
        Editor.withoutNormalizing(editor, () => {
          Transforms.insertText(editor, `${expected[0]}${title} `, { at });
          if (entry && groupId != null)
            Transforms.setNodes(
              editor,
              {
                taskGroup: {
                  id: groupId,
                  token: `${expected[0]}${title}`,
                  ...(group?.createdAt != null ? { createdAt: group.createdAt } : {}),
                },
              },
              { at: entry[1] }
            );
        });
      }
      return undefined;
    });
  } catch (error) {
    notifierOf(editor).error(error instanceof Error ? error.message : "项目补全失败");
  } finally {
    reference.unref();
    submission.dispose();
  }
}
