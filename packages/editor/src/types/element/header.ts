import type { InlineElement } from "../custom-element";
import type { FormattedText } from "../text";

export interface HeaderElement {
  type: "header";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: Array<InlineElement | FormattedText>;
  collapsed?: boolean;
}
