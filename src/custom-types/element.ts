import { Descendant } from "slate";
import {FormattedText} from "./text";

export interface ParagraphElement {
  type: 'paragraph';
  children: Array<FormattedText | LinkElement | InlineMathElement>
}

export interface CodeBlockElement {
  type: 'code-block';
  language: string;
  code: string;
  uuid: string;
  children: Descendant[];
}

export interface CalloutElement {
  type: 'callout';
  calloutType: 'tip' | 'warning' | 'info' | 'danger' | 'note';
  children: Descendant[];
}

export interface HeaderElement {
  type: 'header';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: Descendant[];
}

export interface ListItemElement {
  type: 'list-item';
  children: Descendant[];
}

export interface BulletedListElement {
  type: 'bulleted-list';
  children: ListItemElement[];
}

export interface NumberedListElement {
  type: 'numbered-list';
  children: ListItemElement[];
}

export interface ImageElement {
  type: 'image';
  url: string;
  alt?: string;
  pasteUploading?: boolean;
  children: Descendant[];
}

export interface DetailElement {
  type: 'detail';
  children: Descendant[];
}

export interface BlockquoteElement {
  type: 'blockquote';
  children: Descendant[];
}

export interface LinkElement {
  type: 'link';
  url: string;
  children: FormattedText[];
}

// export interface TableHeadElement {
//
// }

export interface TableCellElement {
  type: 'table-cell',
  children: Array<FormattedText | LinkElement>
}

export interface TableRowElement {
  type: 'table-row'
  children: TableCellElement[]
}

export interface TableElement {
  type: 'table',
  children: TableRowElement[]
}

export interface InlineMathElement {
  type: 'inline-math',
  tex: string,
  children: FormattedText[]
}

export interface BlockMathElement {
  type: 'block-math',
  tex: string,
  children: FormattedText[]
}

export interface CheckListItemElement {
  type: 'check-list-item',
  checked: boolean,
  children: Descendant[]
}

export interface CheckListElement {
  type: 'check-list',
  children: CheckListItemElement[]
}
