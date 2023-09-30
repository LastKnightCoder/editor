import {applyPlugin} from "@/components/Editor/utils";
import {Editor} from "slate";

import markdownSyntax from "./markdownSyntax.ts";

export const withBulletedList = (editor: Editor) => {
  return applyPlugin(editor, [markdownSyntax]);
}