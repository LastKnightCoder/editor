import type { InlineElement } from "../custom-element";
import type { FormattedText } from "../text";

export interface ParagraphElement {
  type: "paragraph";
  children: Array<InlineElement | FormattedText>;
  disableDrag?: boolean;
}
