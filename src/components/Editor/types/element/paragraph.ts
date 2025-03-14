import { InlineElement } from "../custom-element.ts";

export interface ParagraphElement {
  type: "paragraph";
  children: InlineElement[];
}
