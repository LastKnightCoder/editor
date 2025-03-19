import { InlineElement } from "@editor/types";

export interface HeaderElement {
  type: "header";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: InlineElement[];
  collapsed?: boolean;
}
