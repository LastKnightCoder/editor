import codeblock from "./codeblock";
import header from "./header";
import list from "./list";

import { applyPlugin } from "../../utils";
import { Editor } from "slate";

export const withDeleteBackward = (editor: Editor) => {
  return applyPlugin(editor, [codeblock, header, list]);
}