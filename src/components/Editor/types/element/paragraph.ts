import { InlineElement } from "../custom-element.ts";
import { FormattedText } from "../text.ts";

export interface ParagraphElement {
  type: "paragraph";
  children: Array<InlineElement | FormattedText>;
  disableDrag?: boolean;
}
