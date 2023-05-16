import codeblock from "./codeblock";
import header from "./header";
import list from "./list";
import detail from "./detail";
import table from "./table";

import { applyPlugin } from "../../utils";
import { Editor } from "slate";

export const withDeleteBackward = (editor: Editor) => {
  return applyPlugin(editor, [codeblock, header, list, detail, table]);
}