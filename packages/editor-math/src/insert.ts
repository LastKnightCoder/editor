import { Editor, Transforms, Range } from "slate";
import { setOrInsertNode, focusInsertedPreviewElement, getCurrentTextNode } from "@tau/editor/api";

export const insertBlockMath = (editor: Editor) => {
  const path = setOrInsertNode(editor, {
    type: "block-math",
    tex: "",
    children: [{ type: "formatted", text: "" }],
  });
  focusInsertedPreviewElement(editor, path);
  return path;
};

export const unWrapInlineMath = (editor: Editor) => {
  Transforms.unwrapNodes(editor, { match: node => node.type === "inline-math" });
};

export const wrapInlineMath = (editor: Editor) => {
  const { selection } = editor;
  const [node] = getCurrentTextNode(editor);
  if (selection && !Range.isCollapsed(selection) && node.type === "formatted") {
    const text = Editor.string(editor, selection);
    ["bold", "code", "italic", "underline", "highlight", "color"].forEach(type => {
      Editor.removeMark(editor, type);
    });
    editor.deleteBackward("character");
    Transforms.wrapNodes(
      editor,
      {
        type: "inline-math",
        tex: text,
        children: [{ type: "formatted", text: "" }],
      },
      { at: selection, split: true }
    );
  }
};
