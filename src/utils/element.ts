import {ParagraphElement} from "../custom-types";

export const isParagraphEmpty = (element: ParagraphElement) => {
  return element.children.length === 1 && element.children[0].text === '';
}
