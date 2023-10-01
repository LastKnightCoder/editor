import { Editor } from "slate";
import checklist from "./checklist";
import table from "./table";
import {applyPlugin} from "../../utils";

export const withInsertBreak = (editor: Editor) => {
  return applyPlugin(editor, [table, checklist]);
}