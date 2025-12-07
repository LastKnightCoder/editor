import { InlineElement } from "../custom-element";
import { FormattedText } from "../text";

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
