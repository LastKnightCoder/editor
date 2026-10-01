import type { Editor } from "slate";
import { setOrInsertNode } from "@tau/editor/api";
export const insertDivideLine = (editor: Editor) => {
  return setOrInsertNode(editor, {
    type: "divide-line",
    children: [{ type: "formatted", text: "" }],
  });
};
