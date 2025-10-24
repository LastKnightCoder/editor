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
  displayText?: string,
) => {
  const { selection } = editor;

  if (!selection) return;

  const [node] = getCurrentTextNode(editor);

  // 如果有选中文本，包裹选中文本
  if (!Range.isCollapsed(selection) && node.type === "formatted") {
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
  } else {
    // 如果没有选中文本（光标状态），插入一个新的 content-link
    const contentLinkNode = {
      type: "content-link",
      contentId,
      contentType,
      contentTitle,
      refId,
      children: [
        {
          type: "formatted",
          text: displayText || contentTitle || "链接",
        },
      ],
    };
    // @ts-ignore
    Transforms.insertNodes(editor, contentLinkNode, {
      at: selection,
    });
    // 将光标移到插入的 content-link 之后
    Transforms.move(editor, { distance: 1, unit: "offset" });
  }
};
