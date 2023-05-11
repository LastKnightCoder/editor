import codeblock from "./codeblock";
import list from './list';
import header from "./header";

import { applyPlugin } from "../../utils";
import {Editor} from "slate";

export const withMarkdownShortcuts = (editor: Editor) => {
  return applyPlugin(editor, [codeblock, list, header]);
}