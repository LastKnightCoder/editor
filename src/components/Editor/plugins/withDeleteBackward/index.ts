import checkList from "./check-list";
import table from "./table";

import { applyPlugin } from "../../utils";
import { Editor } from "slate";

export const withDeleteBackward = (editor: Editor) => {
  return applyPlugin(editor, [table, checkList]);
}