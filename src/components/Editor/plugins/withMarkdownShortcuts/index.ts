import inlineCode from "./inlineCode";

import { applyPlugin } from "../../utils";
import {Editor} from "slate";

export const withMarkdownShortcuts = (editor: Editor) => {
  return applyPlugin(editor, [inlineCode]);
}
