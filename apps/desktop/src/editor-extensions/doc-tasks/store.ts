/**
 * 勾选项里 `#` 项目候选的状态。同一时刻只有一个编辑器能打开候选，store 记着是哪一个；
 * 候选面板由扩展图层渲染，只在 editor 属于自己时显示。
 */

import { create } from "zustand";
import { Editor } from "slate";
import { docTaskGroupsOf } from "./service";

export type TagPickerItem =
  { kind: "group"; id: number; title: string } | { kind: "create"; title: string };

interface State {
  editor: Editor | null;
  query: string;
  activeIndex: number;
  /** 面板按 query 过滤后写回的候选（键盘选择用） */
  items: TagPickerItem[];
}

export const useTagPickerStore = create<State>(() => ({
  editor: null,
  query: "",
  activeIndex: 0,
  items: [],
}));

export const isTagPickerOpenFor = (editor: Editor) =>
  useTagPickerStore.getState().editor === editor;

export const openTagPicker = (editor: Editor) =>
  useTagPickerStore.setState({ editor, query: "", activeIndex: 0, items: [] });

export const closeTagPicker = () =>
  useTagPickerStore.setState({ editor: null, query: "", activeIndex: 0, items: [] });

export const moveTagPickerActive = (down: boolean) =>
  useTagPickerStore.setState(state => {
    const count = state.items.length;
    if (count === 0) return state;
    return { activeIndex: (state.activeIndex + (down ? 1 : -1) + count) % count };
  });

/** 用完整项目名替换已打出的 query（保留 `#`），新建项目时先建再写 */
export async function selectTagPickerItem(item: TagPickerItem) {
  const { editor, query } = useTagPickerStore.getState();
  if (!editor) return;
  closeTagPicker();
  let title = item.title;
  if (item.kind === "create") {
    const groups = docTaskGroupsOf(editor);
    if (!groups) return;
    title = (await groups.create(item.title)).title;
  }
  for (let i = 0; i < query.length; i += 1) Editor.deleteBackward(editor, { unit: "character" });
  Editor.insertText(editor, `${title} `);
}
