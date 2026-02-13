import { getCurrentTextNode } from "@tau/editor/src";
import { Editor, Element, Range, Transforms } from "slate";

type ContentLinkElement = {
  type: "content-link";
  contentId: number;
  contentType: string;
  contentTitle: string;
  refId: number;
  children: Array<{
    type: "formatted";
    text: string;
  }>;
};

type WrapContentLinkPayload = {
  contentId: number;
  contentType: string;
  contentTitle: string;
  refId: number;
  displayText?: string;
};

const MARK_KEYS = ["bold", "code", "italic", "underline", "highlight", "color"];

export function isContentLinkActive(editor: Editor): boolean {
  const [contentLink] = Editor.nodes(editor, {
    match: (node) =>
      !Editor.isEditor(node) &&
      Element.isElement(node) &&
      (node as { type?: string }).type === "content-link",
  });
  return !!contentLink;
}

export function unwrapContentLink(editor: Editor): void {
  Transforms.unwrapNodes(editor, {
    match: (node) =>
      !Editor.isEditor(node) &&
      Element.isElement(node) &&
      (node as { type?: string }).type === "content-link",
  });
}

export function wrapContentLink(
  editor: Editor,
  payload: WrapContentLinkPayload,
): void {
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
    MARK_KEYS.forEach((markKey) => {
      Editor.removeMark(editor, markKey);
    });
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
    type: "content-link",
    contentId,
    contentType,
    contentTitle,
    refId,
    children: [
      {
        type: "formatted",
        text: displayText || contentTitle || "关联内容",
      },
    ],
  };

  Transforms.insertNodes(editor, contentLinkNode as any, { at: selection });
  Transforms.move(editor, { distance: 1, unit: "offset" });
}
