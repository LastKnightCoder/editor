import {Editor, Transforms} from "slate";
import {FormattedText, ImageElement} from "../custom-types";

interface ImageParams {
  url: string;
  alt?: string;
  pasteUploading?: boolean;
}

export const insertImage = (editor: Editor, params: ImageParams) => {
  const text: FormattedText = { type: 'formatted', text: '' }
  const image: ImageElement = { type: 'image', ...params, children: [text] }
  Transforms.insertNodes(editor, image)
}