import { Editor, Transforms, Element, Path, Range } from "slate";
import { wrapInlineText } from "@tau/editor/api";
import type { ContentLinkElement } from "../types";

export const unwrapContentLink = (editor: Editor) => {
  Transforms.unwrapNodes(editor, {
    match: n => !Editor.isEditor(n) && Element.isElement(n) && n.type === "content-link",
  });
};

export const wrapContentLink = (
  editor: Editor,
  contentId: number,
  contentType: string,
  contentTitle: string,
  refId: number,
  displayText?: string
) => {
  const { selection } = editor;

  if (!selection) return;

  const contentLink: ContentLinkElement = {
    type: "content-link",
    contentId,
    contentType,
    contentTitle,
    refId,
    children: [],
  };
  if (Range.isExpanded(selection)) {
    wrapInlineText(editor, () => contentLink);
    Transforms.collapse(editor, { edge: "end" });
    return;
  }

  const insertedPath = Path.next(selection.anchor.path);
  contentLink.children = [{ type: "formatted", text: displayText || contentTitle || "链接" }];
  Transforms.insertNodes(editor, contentLink, { at: selection });
  const after = Editor.after(editor, insertedPath, { voids: true });
  if (after) Transforms.select(editor, after);
};
