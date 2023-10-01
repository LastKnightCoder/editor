import checkList from "./check-list";
import detail from "./detail";
import table from "./table";

import { applyPlugin } from "../../utils";
import { Editor } from "slate";

export const withDeleteBackward = (editor: Editor) => {
  return applyPlugin(editor, [detail, table, checkList]);
}