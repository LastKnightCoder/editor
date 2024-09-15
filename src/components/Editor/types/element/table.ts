import { InlineElement } from '../custom-element.ts';

export interface TableCellElement {
  type: 'table-cell';
  children: InlineElement[];
}

export interface TableRowElement {
  type: 'table-row';
  children: TableCellElement[];
}

export interface TableElement {
  type: 'table';
  children: TableRowElement[];
}
