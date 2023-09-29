import { Editor } from "slate";
import { applyPlugin } from "@/components/Editor/utils";

import deleteBackward from "./deleteBackward.ts";
import markdownSyntax from "./markdownSyntax.ts";
import insertBreak from "./insertBreak.ts";

export const withHeader = (editor: Editor) => {
  return applyPlugin(editor, [deleteBackward, markdownSyntax, insertBreak]);
}