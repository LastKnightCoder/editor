import type { Editor } from "slate";
import { setOrInsertNode, focusInsertedPreviewElement } from "@tau/editor/api";
import type { CustomBlockElement } from "./types";

const defaultCustomBlockContent = "const Component = () => {\n  \n}";

export const insertCustomBlock = (editor: Editor) => {
  const node: CustomBlockElement = {
    type: "custom-block",
    content: defaultCustomBlockContent,
    children: [{ type: "formatted", text: "" }],
  };
  const path = setOrInsertNode(editor, node);
  focusInsertedPreviewElement(editor, path, 5);
  return path;
};
