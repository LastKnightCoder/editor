import { Editor, Transforms } from "slate";
import { InlineImageElement } from "../../../types";

export function insertInlineImage(
  editor: Editor,
  props: { url: string; uuid: string }
): void {
  const inlineImage: InlineImageElement = {
    type: "inline-image",
    url: props.url,
    uuid: props.uuid,
    children: [{ type: "formatted", text: "" }],
  };

  Transforms.insertNodes(editor, inlineImage);
}
