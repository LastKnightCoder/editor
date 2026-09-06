import { Editor, NodeEntry } from "slate";
import { isParagraphAndEmpty } from "../../../utils";
import type { TabPaneElement } from "../../../types";
import { deleteCurTab } from "./utils";

export const deleteEmptyTab = (editor: Editor) => {
  const { deleteBackward } = editor;

  editor.deleteBackward = unit => {
    // 当前 Tab（pane）内容仅剩一个空段落时，退格删除整个 Tab
    const [match] = Editor.nodes(editor, {
      match: n => n.type === "tab-pane",
    });
    if (!match) {
      return deleteBackward(unit);
    }

    const [paneEle] = match as NodeEntry<TabPaneElement>;
    if (paneEle.children.length > 1 || !isParagraphAndEmpty(editor)) {
      return deleteBackward(unit);
    }

    deleteCurTab(editor, match[1]);
  };

  return editor;
};
