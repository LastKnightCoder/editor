import { Editor } from "slate";
import { applyPlugin } from "@/components/Editor/utils";

import pasteImage from "./pasteImage.ts";

export const withImage = (editor: Editor) => {
  return applyPlugin(editor, [pasteImage]);
}
