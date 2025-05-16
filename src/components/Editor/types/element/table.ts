import { InlineElement } from "../custom-element.ts";
import { FormattedText } from "../text.ts";

export interface TableCellElement {
  type: "table-cell";
  children: Array<InlineElement | FormattedText>;
}

export interface TableRowElement {
  type: "table-row";
  children: TableCellElement[];
}

export interface TableElement {
  type: "table";
  children: TableRowElement[];
}
