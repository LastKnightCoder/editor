import type { InlineElement } from "@tau/editor/api";
import type { FormattedText } from "@tau/markdown/model";

export interface HeaderElement {
  type: "header";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: Array<InlineElement | FormattedText>;
  collapsed?: boolean;
}
