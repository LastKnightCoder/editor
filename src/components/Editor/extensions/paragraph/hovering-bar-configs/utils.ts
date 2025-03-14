import { Mark } from "@/components/Editor/types";
import { BaseSelection, Editor } from "slate";

export const isMarkActive = (
  mark: Mark,
  editor: Editor,
  selection: BaseSelection,
) => {
  if (!selection) {
    return false;
  }
  const marks = Editor.marks(editor);
  return !!(marks && marks[mark]);
};
