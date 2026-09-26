/**
 * `$` Skill 选择面板状态。同一时刻只有一个编辑器能打开面板，store 里记着是哪一个；
 * 面板组件由各输入框自己挂，只在 editor 属于自己时渲染。
 */

import { create } from "zustand";
import { Editor, Transforms } from "slate";
import type { SkillRefElement } from "./types";

export interface SkillPickerItem {
  folderName: string;
  name: string;
  description: string;
  manual: boolean;
}

interface State {
  editor: Editor | null;
  query: string;
  activeIndex: number;
  /** 面板当前展示的候选（由面板组件按 query 过滤后写回，键盘选择用） */
  items: SkillPickerItem[];
}

export const useSkillPickerStore = create<State>(() => ({
  editor: null,
  query: "",
  activeIndex: 0,
  items: [],
}));

export const isPickerOpenFor = (editor: Editor) => useSkillPickerStore.getState().editor === editor;

export const openSkillPicker = (editor: Editor) =>
  useSkillPickerStore.setState({ editor, query: "", activeIndex: 0 });

export const closeSkillPicker = () =>
  useSkillPickerStore.setState({ editor: null, query: "", activeIndex: 0, items: [] });

export const moveSkillPickerActive = (down: boolean) =>
  useSkillPickerStore.setState(state => {
    const count = state.items.length;
    if (count === 0) return state;
    return { activeIndex: (state.activeIndex + (down ? 1 : -1) + count) % count };
  });

/** 删掉已打出的「$query」，插入芯片 + 一个空格 */
export const selectSkill = (item: SkillPickerItem) => {
  const { editor, query } = useSkillPickerStore.getState();
  if (!editor) return;
  closeSkillPicker();
  for (let i = 0; i < query.length + 1; i += 1)
    Editor.deleteBackward(editor, { unit: "character" });
  const node: SkillRefElement = {
    type: "skill-ref",
    folderName: item.folderName,
    name: item.name,
    children: [{ type: "formatted", text: "" }],
  };
  Transforms.insertNodes(editor, node as never);
  Transforms.move(editor);
  Editor.insertText(editor, " ");
};
