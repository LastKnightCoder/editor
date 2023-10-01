import inlineCode from "./inlineCode";
import blockquote from "./blockquote";
import divideLine from "./divide-line";

import { applyPlugin } from "../../utils";
import {Editor} from "slate";

export const withMarkdownShortcuts = (editor: Editor) => {
  return applyPlugin(editor, [inlineCode, blockquote, divideLine]);
}
