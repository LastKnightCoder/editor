import deleteBackward from './deleteBackward.ts';
import insertBreak from './insertBreak.ts';
import { applyPlugin } from "@/components/Editor/utils";
import { Editor } from "slate";

export const withListItem = (editor: Editor) => {
  return applyPlugin(editor, [deleteBackward, insertBreak]);
}
