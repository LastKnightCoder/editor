import { Editor, Transforms, Element, Range } from "slate";
import { getCurrentTextNode } from "@/components/Editor/utils";

export const unwrapContentLink = (editor: Editor) => {
  Transforms.unwrapNodes(editor, {
    match: (n) =>
      // @ts-ignore
      !Editor.isEditor(n) && Element.isElement(n) && n.type === "content-link",
  });
};

export const wrapContentLink = (
  editor: Editor,
  contentId: number,
  contentType: string,
  contentTitle: string,
  refId: number,
) => {
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
        type: "content-link",
        contentId,
        contentType,
        contentTitle,
        refId,
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
