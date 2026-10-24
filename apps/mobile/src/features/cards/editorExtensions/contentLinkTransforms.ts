import { getCurrentTextNode } from "@tau/editor";
import { Editor, Range, Transforms, type Path } from "slate";

import {
  CONTENT_LINK_TYPE,
  type ContentLinkElement,
  type ContentLinkTarget,
} from "./contentLinkModel";

type WrapContentLinkPayload = ContentLinkTarget & { displayText?: string };

const MARK_KEYS = ["bold", "code", "italic", "underline", "highlight", "color"];

export function wrapContentLink(editor: Editor, payload: WrapContentLinkPayload): void {
  const { contentId, contentType, contentTitle, refId, displayText } = payload;
  const { selection } = editor;
  if (!selection) return;

  const currentTextNode = getCurrentTextNode(editor);
  const currentLeaf = currentTextNode?.[0];

  if (
    !Range.isCollapsed(selection) &&
    currentLeaf &&
    (currentLeaf as { type?: string }).type === "formatted"
  ) {
    const selectedText = Editor.string(editor, selection);
    MARK_KEYS.forEach(markKey => {
      Editor.removeMark(editor, markKey);
    });
    editor.deleteBackward("character");

    const contentLinkNode: ContentLinkElement = {
      type: CONTENT_LINK_TYPE,
      contentId,
      contentType,
      contentTitle,
      refId,
      children: [
        {
          type: "formatted",
          text: selectedText,
        },
      ],
    };

    Transforms.wrapNodes(editor, contentLinkNode as any, {
      at: selection,
      split: true,
    });
    Transforms.collapse(editor, { edge: "end" });
    return;
  }

  const contentLinkNode: ContentLinkElement = {
    type: CONTENT_LINK_TYPE,
    contentId,
    contentType,
    contentTitle,
    refId,
    children: [
      {
        type: "formatted",
        text: displayText || contentTitle || "引用内容",
      },
    ],
  };

  Transforms.insertNodes(editor, contentLinkNode as any, { at: selection });
  Transforms.move(editor, { distance: 1, unit: "offset" });
}

/** 把引用改指向另一条内容，显示文字保持不变 */
export function retargetContentLink(editor: Editor, path: Path, target: ContentLinkTarget): void {
  const { contentId, contentType, contentTitle, refId } = target;
  Transforms.setNodes(editor, { contentId, contentType, contentTitle, refId } as never, {
    at: path,
  });
}
