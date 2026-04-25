import { Editor, Transforms, Element, Path, Range } from "slate";
import { getCurrentTextNode } from "@tau/editor/src";
import type { ContentLinkElement } from "../types";

export const unwrapContentLink = (editor: Editor) => {
  Transforms.unwrapNodes(editor, {
    match: (n) =>
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
    const contentLinkNode: ContentLinkElement = {
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
    };
    Transforms.wrapNodes(editor, contentLinkNode, {
      at: selection,
      split: true,
    });
    Transforms.collapse(editor, { edge: "end" });
  } else {
    // 如果没有选中文本（光标状态），插入一个新的 content-link
    const insertedPath = Path.next(selection.anchor.path);
    const contentLinkNode: ContentLinkElement = {
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
    Transforms.insertNodes(editor, contentLinkNode, {
      at: selection,
    });
    const after = Editor.after(editor, insertedPath, { voids: true });
    if (after) {
      Transforms.select(editor, after);
    }
  }
};
