import {Descendant, Text} from "slate";

export interface ParagraphElement {
  type: 'paragraph';
  children: Text[];
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
