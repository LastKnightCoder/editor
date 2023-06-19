import codeblock from "./codeblock";
import list from './list';
import header from "./header";
import inlineCode from "./inlineCode";
import blockquote from "./blockquote";
import divideLine from "./divide-line";

import { applyPlugin } from "../../utils";
import {Editor} from "slate";

export const withMarkdownShortcuts = (editor: Editor) => {
  return applyPlugin(editor, [codeblock, list, header, inlineCode, blockquote, divideLine]);
}
