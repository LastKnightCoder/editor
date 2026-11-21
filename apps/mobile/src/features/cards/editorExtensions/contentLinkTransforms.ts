import { wrapInlineText } from "@tau/editor/api";
import { Editor, Range, Transforms, type Path } from "slate";

import {
  CONTENT_LINK_TYPE,
  type ContentLinkElement,
  type ContentLinkTarget,
} from "./contentLinkModel";

type WrapContentLinkPayload = ContentLinkTarget & { displayText?: string };

export function wrapContentLink(editor: Editor, payload: WrapContentLinkPayload): void {
  const { contentId, contentType, contentTitle, refId, displayText } = payload;
  const { selection } = editor;
  if (!selection) return;

  const contentLink: ContentLinkElement = {
    type: CONTENT_LINK_TYPE,
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

  contentLink.children = [{ type: "formatted", text: displayText || contentTitle || "引用内容" }];
  Transforms.insertNodes(editor, contentLink, { at: selection });
  Transforms.move(editor, { distance: 1, unit: "offset" });
}

/** 把引用改指向另一条内容，显示文字保持不变 */
export function retargetContentLink(editor: Editor, path: Path, target: ContentLinkTarget): void {
  const { contentId, contentType, contentTitle, refId } = target;
  Transforms.setNodes(
    editor,
    { contentId, contentType, contentTitle, refId },
    {
      at: path,
    }
  );
}
