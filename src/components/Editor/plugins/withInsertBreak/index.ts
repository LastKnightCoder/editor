import { Editor } from "slate";
import list from './list';
import checklist from "./checklist";
import header from './header';
import table from "./table";
import {applyPlugin} from "../../utils";

export const withInsertBreak = (editor: Editor) => {
  return applyPlugin(editor, [list, header, table, checklist]);
}