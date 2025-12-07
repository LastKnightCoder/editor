import { InlineElement } from "../custom-element";
import { FormattedText } from "../text";

export interface ParagraphElement {
  type: "paragraph";
  children: Array<InlineElement | FormattedText>;
  disableDrag?: boolean;
}
