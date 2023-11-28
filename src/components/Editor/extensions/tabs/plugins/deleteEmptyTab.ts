import { Editor, NodeEntry } from "slate";
import { isParagraphAndEmpty } from "@/components/Editor/utils";
import { TabsElement } from "@/components/Editor/types";
import { deleteCurTab } from './utils.ts';

export const deleteEmptyTab = (editor: Editor) => {
  const { deleteBackward } = editor;

  editor.deleteBackward = (unit) => {
    const [match] = Editor.nodes(editor, {
      match: n => n.type === 'tabs'
    });
    if (!match) {
      return deleteBackward(unit);
    }

    const [tabsEle, tabsPath] = match as NodeEntry<TabsElement>;
    if (tabsEle.children.length > 1 || !isParagraphAndEmpty(editor)) {
      return deleteBackward(unit);
    }

    // 删除当前 Tab
    deleteCurTab(editor, tabsEle, tabsPath);
  }

  return editor;
}
