import { Editor, Transforms, Element, Range } from "slate";
import { getCurrentTextNode } from "@/components/Editor/utils";

export const unwrapCardLink = (editor: Editor) => {
  Transforms.unwrapNodes(editor, {
    match: (n) =>
      // @ts-ignore
      !Editor.isEditor(n) && Element.isElement(n) && n.type === "card-link",
  });
};

export const wrapCardLink = (editor: Editor, cardId: number) => {
  const { selection } = editor;
  const [node] = getCurrentTextNode(editor);
  if (selection && !Range.isCollapsed(selection) && node.type === "formatted") {
    const text = Editor.string(editor, selection);
    ["bold", "code", "italic", "underline", "highlight", "color"].forEach(
      (type) => {
        Editor.removeMark(editor, type);
      },
    );
    editor.deleteBackward("character");
    Transforms.wrapNodes(
      editor,
      {
        // @ts-ignore
        type: "card-link",
        cardId,
        children: [
          {
            type: "formatted",
            text,
          },
        ],
      },
      {
        at: selection,
        split: true,
      },
    );
    Transforms.collapse(editor, { edge: "end" });
  }
};
